package io.github.ravindu644.heirloom;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.AtomicFile;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.Iterator;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The one drawer for everything heirloom shows on the phone: the countdown, the bell, a called
 * lap's alarm, and room notes and calls. Two feeders keep it current, the page (CountdownPlugin)
 * and the background service (KeepService). Each says (timer stamp, state); the newer stamp wins,
 * the page on a tie, since its words are the richest (ARCHITECTURE section 6).
 *
 * What it holds lives in one JSON file in the no-backup folder, so the receiver and the service
 * can act after the process was killed. Not encrypted: the page's copy of the token sits in the
 * same sandbox, and a token can be revoked.
 *
 * The decisions are static functions over plain values, so the JVM tests reach them without a phone.
 */
final class Shade {

    /** A bell closer than this to now is a phase already ending, such as a tap on finish: no bell. */
    static final long MOMENT_MS = 1000;
    /** The bell takes ids 1 and 2 in turn; see bell(). */
    static final int BELL = 1;
    // The running countdown and the still one have ids of their own: see countdown().
    static final int COUNTDOWN = 7400;
    static final int PAUSED = 7401;
    static final int CALL = 7402;
    // Tagged by room id: one note and one new call per room in the shade.
    static final int NOTE = 7403;
    static final int CALLED = 7404;
    static final int KEEP = 7405;
    static final String OPEN = "io.github.ravindu644.heirloom.OPEN";
    /** Which bell's notification an answer came from, so it leaves the shade. */
    static final String BELL_ID = "io.github.ravindu644.heirloom.BELL_ID";
    /** Channels an earlier build made and this one no longer posts on. */
    static final String[] GONE = { "ring" };

    /** The app is on screen: nothing room-related shows, the screen already says it. From MainActivity. */
    static volatile boolean front;

    private static JSONObject held;

    private Shade() {}

    // The pure part: the JVM tests call these.

    /** Whether a feed's timer replaces the one held: a newer stamp, or the page's on a tie. Plain string order (protocol section 2). */
    static boolean takes(String held, String stamp, boolean page) {
        int c = nz(stamp).compareTo(nz(held));
        return c > 0 || (c == 0 && page);
    }

    /** A new server, account or token is someone else's phone as far as the drawer knows: everything goes. */
    static boolean wipes(JSONObject held, JSONObject keep) {
        for (String key : new String[] { "server", "account", "token" }) {
            if (!held.optString(key).equals(keep.optString(key))) return true;
        }
        return false;
    }

    /** The timer's view at `now`, server time (protocol section 6). `ends` is -1 while paused or idle. */
    static final class View {
        final long left;
        final long ends;
        final boolean paused;
        final boolean over;

        View(long left, long ends, boolean paused, boolean over) {
            this.left = left;
            this.ends = ends;
            this.paused = paused;
            this.over = over;
        }
    }

    static View view(JSONObject s, long now) {
        if ("idle".equals(s.optString("phase", "idle")) || s.isNull("started")) return new View(0, -1, false, false);
        long started = s.optLong("started");
        long pausedMs = s.optLong("paused_ms");
        long planned = s.optLong("planned_ms");
        boolean paused = !s.isNull("paused_at");
        long ends = paused ? -1 : started + pausedMs + planned;
        long ran = (paused ? s.optLong("paused_at") : now) - started - pausedMs;
        return new View(Math.max(0, planned - ran), ends, paused, ends >= 0 && now >= ends);
    }

    /** The timer's face, as strings.ts `clock` says it: "18:42", from 100 minutes "5:59:59". Rounded up. */
    static String clock(long ms) {
        long s = (ms + 999) / 1000;
        return s < 6000
            ? String.format(Locale.ROOT, "%02d:%02d", s / 60, s % 60)
            : String.format(Locale.ROOT, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60);
    }

    static String fill(String template, String... pairs) {
        String out = template;
        for (int i = 0; i + 1 < pairs.length; i += 2) out = out.replace("{" + pairs[i] + "}", pairs[i + 1]);
        return out;
    }

    /**
     * What the page would plan for a timer heard by the service, worded from the templates it handed
     * over: the same shape as a page's Ring or Paused, or null. `offset` is how far the server's clock
     * is ahead of this phone's; `now` is this phone's.
     */
    static JSONObject ringFor(JSONObject s, JSONObject w, long now, long offset) throws JSONException {
        return ringFor(s, w, now, offset, null);
    }

    /** `auto`: settings.auto_break and auto_work, { break, work }, from keep(). */
    static JSONObject ringFor(JSONObject s, JSONObject w, long now, long offset, JSONObject auto) throws JSONException {
        if (s == null || w == null) return null;
        String phase = s.optString("phase", "idle");
        if ("idle".equals(phase)) return null;
        View v = view(s, now + offset);
        boolean work = "work".equals(phase);
        int i = Math.max(0, Math.min(3, s.optInt("set_index")));
        String during = w.getJSONObject("during").optString(phase);
        JSONObject a = w.getJSONObject("actions");
        JSONObject actions = new JSONObject()
            .put("pause", a.optString("pause"))
            .put("resume", a.optString("resume"))
            .put("stop", work ? a.optString("stop") : a.optString("done", a.optString("stop")))
            .put("run", s.opt("run") == null ? JSONObject.NULL : s.opt("run"));
        if (v.paused) {
            return new JSONObject().put("paused", true).put("during", during).put("left", fill(w.optString("left"), "t", clock(v.left))).put("actions", actions);
        }
        if (v.ends < 0) return null;
        JSONObject b = w.getJSONObject("bell");
        return new JSONObject()
            .put("at", v.ends - offset)
            .put("title", work ? b.getJSONArray("lap").optString(i) : b.optString("break"))
            .put("body", (work ? b.getJSONArray("take") : b.getJSONArray("next")).optString(i))
            .put("during", during)
            .put("actions", actions)
            .put("answers", answers(w.optJSONObject("answer"), work, i, auto != null && (work ? auto.optBoolean("break") : "short".equals(phase) && auto.optBoolean("work"))));
    }

    /**
     * The bell's answers (DESIGN.md, "A bell you can answer"), from the templates: after a lap, the
     * break by its own length and "Done for now"; after a break, the next lap and "Done for now".
     */
    static JSONArray answers(JSONObject a, boolean work, int set, boolean auto) throws JSONException {
        JSONArray out = new JSONArray();
        if (a == null) return out;
        // The next phase starts by itself at this bell: only "Done for now", which stops it.
        if (auto) return out.put(new JSONObject().put("act", "rest").put("label", a.optString("rest")));
        if (work) out.put(new JSONObject().put("act", "break").put("label", a.getJSONArray("break").optString(set)));
        else out.put(new JSONObject().put("act", "next").put("label", a.optString("next")));
        return out.put(new JSONObject().put("act", "rest").put("label", a.optString("rest")));
    }

    /**
     * What becomes of the bell Android holds (`given`: id, at, title, body; or null) for a plan that
     * rings `ring` (null for none). Answers {id to cancel, id to set}, 0 for neither; with both 0 the
     * bell held stays as it is.
     *
     * The same bell with the same words is left exactly as it is. A bell still to come is taken back
     * and its id reused. A bell whose time has come is Android's from then on: at the bell the timer
     * stops running and plans nothing a moment before Android may deliver the alarm (in deep Doze it
     * was late, and a cancel here used to kill it). It is left alone, and the next bell goes on the
     * other id, which also takes it out of the shade two bells later. Only Ring here switched off
     * (`off`) takes back even that one: in deep Doze it may not have been delivered yet.
     */
    static int[] bell(JSONObject given, JSONObject ring, long now, boolean off) {
        int set = ring == null ? 0 : BELL;
        if (given == null) return new int[] { 0, set };
        int id = given.optInt("id", BELL);
        if (off) return new int[] { id, 0 };
        boolean coming = given.optLong("at") - now >= MOMENT_MS;
        if (ring != null && coming && sameBell(given, ring)) {
            return new int[] { 0, 0 };
        }
        if (coming) return new int[] { id, ring == null ? 0 : id };
        return new int[] { 0, ring == null ? 0 : other(id) };
    }

    // The same bell: its time, its words, its answers and the run they answer. An alarm armed by an
    // earlier build, with no answers, is armed again with them.
    private static boolean sameBell(JSONObject given, JSONObject ring) {
        JSONObject actions = ring.optJSONObject("actions");
        Object run = actions == null ? null : actions.opt("run");
        return given.optLong("at") == ring.optLong("at")
            && given.optString("title").equals(ring.optString("title"))
            && given.optString("body").equals(ring.optString("body"))
            && String.valueOf(ring.optJSONArray("answers")).equals(String.valueOf(given.optJSONArray("answers")))
            && String.valueOf(run == JSONObject.NULL ? null : run).equals(String.valueOf(given.isNull("run") ? null : given.opt("run")));
    }

    static int other(int id) {
        return id == BELL ? BELL + 1 : BELL;
    }

    static final int LEAVE = 0;
    static final int FORGET = 1;
    static final int SET = 2;
    static final int OFF = 3;

    /**
     * The called lap's alarm, for `next` (id, at, title, body; or null) against what Android holds.
     * LEAVE it; FORGET it and leave it in the shade (its minute has gone); SET the new one; or take
     * it OFF, alarm and shade. A call whose time has passed sets nothing, and the same call given
     * again after its minute leaves its notification where it is. The page's null does not take back
     * a call the service set (`from: keep`): opening, the page says null before it has heard its
     * rooms; the service's own null comes when the server drops you from the call.
     */
    static int call(JSONObject held, JSONObject next, long now, boolean page) {
        if (next == null && page && held != null && "keep".equals(held.optString("from"))) return LEAVE;
        if (next != null && next.optLong("at") <= now) {
            if (held != null && same(held, next)) return LEAVE;
            next = null;
        }
        if (next == null) return held == null ? LEAVE : held.optLong("at") <= now ? FORGET : OFF;
        return held != null && same(held, next) ? LEAVE : SET;
    }

    // The page and the service work out a call's time from their own copies of the server's clock: a
    // few ms apart is the same call.
    private static boolean same(JSONObject a, JSONObject b) {
        return a.optString("id").equals(b.optString("id"))
            && Math.abs(a.optLong("at") - b.optLong("at")) < 1000
            && a.optString("title").equals(b.optString("title"))
            && a.optString("body").equals(b.optString("body"));
    }

    /** The newest note to show from a room's notes (newest first): newer than `seen`, written by someone in the room who is not `me`. */
    static JSONObject newest(JSONArray notes, String seen, String me) {
        for (int i = 0; i < notes.length(); i++) {
            JSONObject n = notes.optJSONObject(i);
            if (n == null) continue;
            if (n.optString("id").equals(seen)) return null;
            if (!n.isNull("from") && !n.optString("from").equals(me)) return n;
        }
        return null;
    }

    /**
     * Whether a room's call is one to announce: not the one seen last, called by someone else, and
     * still to come. One whose minute has passed, heard again after a reconnect, is no news.
     */
    static boolean news(JSONObject call, String seen, String me, long offset, long now) {
        return call != null && !call.optString("id").equals(seen) && !call.optString("by").equals(me) && call.optLong("at") - offset > now;
    }

    /** On a work lap that is running: a note waits until it ends, as Notes fold away on a lap. */
    static boolean onLap(JSONObject state, JSONObject ring, long now) {
        return state != null && "work".equals(state.optString("phase")) && ring != null && !ring.optBoolean("paused") && ring.optLong("at") > now;
    }

    /** The cursor after a cells frame: its `to`, never backwards; -1 when `from` is past it, so something was missed. */
    static long cursor(long cursor, long from, long to) {
        return from > cursor ? -1 : Math.max(cursor, to);
    }

    /** One more sample of the server's clock offset: a quarter of the way, or whole for a real jump, as transport.ts. */
    static long smooth(Long held, long sample) {
        return held == null || Math.abs(sample - held) > 2000 ? sample : held + (sample - held) / 4;
    }

    // The phone's part: the file, the alarms, the shade.

    /** The page's timer, or the service's. Answers whether Android will ring it; the page rings in-page otherwise. */
    static synchronized boolean offer(Context c, String stamp, JSONObject state, JSONObject ring, boolean page) {
        return offer(c, stamp, state, ring, page, false);
    }

    /**
     * `off`: the page's Ring here is off. Nothing rings or shows, not even a bell already due, and the
     * stamp is forgotten so the plan after it is taken whatever its stamp.
     */
    static synchronized boolean offer(Context c, String stamp, JSONObject state, JSONObject ring, boolean page, boolean off) {
        JSONObject h = held(c);
        boolean can = can(c);
        // A plan for a timer already replaced: Android holds the newer one. The page rings in-page only
        // when Android could not ring anything.
        if (!off && !takes(h.optString("stamp"), stamp, page)) return can;
        boolean rings = can;
        try {
            h.put("stamp", off ? "" : nz(stamp)).put("state", orNull(state)).put("ring", off ? JSONObject.NULL : orNull(ring));
            rings = draw(c, h, off ? null : ring, can, off) && can;
            if (!onLap(state, ring, System.currentTimeMillis())) flush(c, h);
        } catch (JSONException ignored) {
            // put never throws for these values.
        }
        save(c);
        return rings;
    }

    /** A timer cell the service heard: worded from the templates, at the service's own server offset. */
    static synchronized void heard(Context c, String stamp, JSONObject state) {
        JSONObject h = held(c);
        try {
            offer(c, stamp, state, ringFor(state, h.optJSONObject("words"), System.currentTimeMillis(), h.optLong("offset"), h.optJSONObject("auto")), false);
        } catch (JSONException ignored) {
            // Templates missing a part: nothing is drawn from them.
        }
    }

    // False when a bell was wanted and Android would not take the alarm.
    private static boolean draw(Context c, JSONObject h, JSONObject ring, boolean can, boolean off) throws JSONException {
        long now = System.currentTimeMillis();
        boolean paused = ring != null && ring.optBoolean("paused");
        JSONObject rings = ring == null || paused || !can || ring.optLong("at") - now < MOMENT_MS ? null : ring;
        int[] d = bell(h.optJSONObject("bell"), rings, now, off);
        boolean set = true;
        if (d[0] != 0) {
            alarms(c).cancel(alarm(c, Receiver.BELL, d[0], null));
            if (off) NotificationManagerCompat.from(c).cancel(d[0]);
            h.put("bell", JSONObject.NULL);
        }
        if (d[1] != 0) {
            JSONObject actions = rings.optJSONObject("actions");
            JSONObject b = new JSONObject().put("id", d[1]).put("at", rings.optLong("at")).put("title", rings.optString("title")).put("body", rings.optString("body"))
                .put("answers", orNull(rings.optJSONArray("answers"))).put("run", actions == null ? JSONObject.NULL : actions.opt("run"));
            set = exact(c, alarm(c, Receiver.BELL, d[1], b), b.optLong("at"));
            if (set) h.put("bell", b);
        }
        if (paused) countdown(c, ring, false);
        else if (rings != null && ring.has("during")) countdown(c, ring, true);
        else clearCountdown(c);
        return set;
    }

    /** Whether Android will deliver a bell: notifications allowed, and exact alarms (only Android 12 can refuse them). */
    static boolean can(Context c) {
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 31 || alarms(c).canScheduleExactAlarms();
    }

    /** The called lap you are in, from either feeder; null: none. The last one said stands: both read the same server. */
    static synchronized void call(Context c, JSONObject next, boolean page) {
        JSONObject h = held(c);
        if (next != null && !NotificationManagerCompat.from(c).areNotificationsEnabled()) next = null;
        try {
            if (next != null) next = new JSONObject().put("id", next.optString("id")).put("at", next.optLong("at")).put("title", next.optString("title")).put("body", next.optString("body")).put("from", page ? "page" : "keep");
            switch (call(h.optJSONObject("call"), next, System.currentTimeMillis(), page)) {
                case FORGET:
                    h.put("call", JSONObject.NULL);
                    break;
                case OFF:
                    alarms(c).cancel(alarm(c, Receiver.CALL, CALL, null));
                    NotificationManagerCompat.from(c).cancel(CALL);
                    h.put("call", JSONObject.NULL);
                    break;
                case SET:
                    if (exact(c, alarm(c, Receiver.CALL, CALL, next), next.optLong("at"))) h.put("call", next);
                    break;
                default:
                    return;
            }
        } catch (JSONException ignored) {
            return;
        }
        save(c);
    }

    /** What the service needs, from the page; null is a sign-out. A new server, account or token wipes first. */
    static synchronized void keep(Context c, JSONObject k) {
        JSONObject h = held(c);
        if (k == null || wipes(h, k)) {
            wipe(c, h);
            h = held(c);
        }
        if (k != null) {
            try {
                for (String key : new String[] { "server", "account", "token", "device", "on", "words", "ringing", "auto" }) h.put(key, k.opt(key));
                // The page's cursor only starts a fresh one: after that the service reads on from its own.
                if (h.optLong("cursor") == 0) h.put("cursor", k.optLong("cursor"));
                // With the service off, nothing but the page will ever take a call back.
                JSONObject held = h.optJSONObject("call");
                if (!k.optBoolean("on") && held != null) held.put("from", "page");
            } catch (JSONException ignored) {
                // put never throws for these values.
            }
            channels(c, k.optJSONObject("words"));
        }
        save(c);
        KeepService.sync(c);
    }

    private static void wipe(Context c, JSONObject h) {
        AlarmManager am = alarms(c);
        am.cancel(alarm(c, Receiver.BELL, BELL, null));
        am.cancel(alarm(c, Receiver.BELL, other(BELL), null));
        am.cancel(alarm(c, Receiver.CALL, CALL, null));
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        for (int id : new int[] { BELL, other(BELL), COUNTDOWN, PAUSED, CALL }) nm.cancel(id);
        JSONObject rooms = h.optJSONObject("rooms");
        if (rooms != null) for (Iterator<String> it = rooms.keys(); it.hasNext(); ) quiet(c, it.next());
        held = wiped(h);
    }

    /** What survives a wipe: how this phone rings is the phone's, not the account's. */
    static JSONObject wiped(JSONObject h) {
        JSONObject out = new JSONObject();
        try {
            if (h.optJSONObject("ringing") != null) out.put("ringing", h.optJSONObject("ringing"));
        } catch (JSONException ignored) {
            // put never throws for an object.
        }
        return out;
    }

    /** The server said `bye token`: the service stops for good, the alarms stay. A sign-in sends a new token. */
    static synchronized void refused(Context c) {
        held(c).remove("token");
        save(c);
    }

    /** Whether the service should run: a token, its switch and Ring here on, and notifications allowed. */
    static synchronized boolean wanted(Context c) {
        JSONObject h = held(c);
        return !h.optString("token").isEmpty() && h.optBoolean("on") && NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    /** What the service says hello with: server, token, device, cursor. A copy. */
    static synchronized JSONObject link(Context c) {
        JSONObject h = held(c);
        JSONObject l = new JSONObject();
        try {
            for (String key : new String[] { "server", "token", "device", "cursor" }) l.put(key, h.opt(key));
        } catch (JSONException ignored) {
            // put never throws for these values.
        }
        return l;
    }

    static synchronized String words(Context c, String key) {
        JSONObject w = held(c).optJSONObject("words");
        return w == null ? "" : w.optString(key);
    }

    static synchronized void offset(Context c, long sample) {
        JSONObject h = held(c);
        try {
            h.put("offset", smooth(h.has("offset") ? h.optLong("offset") : null, sample));
        } catch (JSONException ignored) {
            // put never throws for a long.
        }
    }

    /** A welcome: a head below the cursor is a server restored from an older copy, so read again from 0; rooms it no longer names are gone. */
    static synchronized void welcome(Context c, long head, JSONArray rooms) {
        JSONObject h = held(c);
        try {
            if (head < h.optLong("cursor")) h.put("cursor", 0);
            JSONObject mine = h.optJSONObject("rooms");
            if (mine != null && rooms != null) {
                String names = rooms.toString();
                for (Iterator<String> it = mine.keys(); it.hasNext(); ) {
                    String id = it.next();
                    if (!names.contains(JSONObject.quote(id))) {
                        it.remove();
                        quiet(c, id);
                    }
                }
            }
            calls(c, h);
        } catch (JSONException ignored) {
            // put never throws for these values.
        }
        save(c);
    }

    /** A cells frame. False when something was missed: the service says hello again. */
    static synchronized boolean cells(Context c, long from, long to, JSONArray cells) {
        JSONObject h = held(c);
        long next = cursor(h.optLong("cursor"), from, to);
        if (next < 0) return false;
        JSONObject timer = null;
        for (int i = 0; cells != null && i < cells.length(); i++) {
            JSONObject cell = cells.optJSONObject(i);
            if (cell == null || !"timer".equals(cell.optString("dataset")) || !"current".equals(cell.optString("row")) || !"state".equals(cell.optString("field"))) continue;
            if (timer == null || cell.optString("stamp").compareTo(timer.optString("stamp")) > 0) timer = cell;
        }
        if (timer != null) heard(c, timer.optString("stamp"), timer.optJSONObject("value"));
        try {
            h.put("cursor", next);
        } catch (JSONException ignored) {
            // put never throws for a long.
        }
        save(c);
        return true;
    }

    /**
     * A room message (protocol section 15). Notifies a new call from someone else, keeps the call
     * alarm for the soonest call you are in, and answers whether the room has notes to fetch. A room
     * heard for the first time sets what is already there as seen: it is not news.
     */
    static synchronized boolean room(Context c, JSONObject m) {
        JSONObject h = held(c);
        String id = m.optString("room");
        try {
            JSONObject rooms = h.optJSONObject("rooms");
            if (rooms == null) h.put("rooms", rooms = new JSONObject());
            if (m.optBoolean("gone")) {
                rooms.remove(id);
                quiet(c, id);
                calls(c, h);
                save(c);
                return false;
            }
            JSONObject r = rooms.optJSONObject(id);
            boolean first = r == null;
            if (first) r = new JSONObject();
            String me = "";
            JSONObject names = new JSONObject();
            JSONArray members = m.optJSONArray("members");
            for (int i = 0; members != null && i < members.length(); i++) {
                JSONObject member = members.optJSONObject(i);
                if (member == null) continue;
                names.put(member.optString("id"), member.optString("name"));
                if (member.optBoolean("you")) me = member.optString("id");
            }
            String name = m.optString("name");
            r.put("name", name).put("me", me).put("names", names);
            JSONObject call = m.optJSONObject("call");
            String callId = call == null ? null : call.optString("id");
            if (!first && news(call, r.optString("call"), me, h.optLong("offset"), System.currentTimeMillis())) {
                JSONObject w = h.optJSONObject("words");
                JSONObject cw = w == null ? null : w.optJSONObject("call");
                if (cw != null && !front) {
                    String time = wall(call.optLong("at") - h.optLong("offset"));
                    String title = fill(cw.optString("title"), "name", names.optString(call.optString("by")), "time", time);
                    announce(c, cw, id, callId, title, name, time, false, false);
                }
            }
            r.put("call", callId == null ? JSONObject.NULL : callId);
            if (call != null) r.put("at", call.optLong("at")).put("by", call.optString("by"));
            boolean in = call != null && call.optJSONArray("in") != null && call.optJSONArray("in").toString().contains(JSONObject.quote(me));
            r.put("in", in ? new JSONObject().put("id", callId).put("at", call.optLong("at")).put("by", call.optString("by")) : JSONObject.NULL);
            String since = m.isNull("notes_since") ? null : m.optString("notes_since");
            boolean fetch = !first && since != null && !since.equals(r.optString("note"));
            if (first) r.put("note", since == null ? JSONObject.NULL : since);
            rooms.put(id, r);
            calls(c, h);
            save(c);
            return fetch;
        } catch (JSONException e) {
            return false;
        }
    }

    /** A room's notes, fetched: the newest new one from someone else shows, or waits for the lap's end. */
    static synchronized void notes(Context c, String room, JSONArray notes) {
        JSONObject h = held(c);
        JSONObject rooms = h.optJSONObject("rooms");
        JSONObject r = rooms == null ? null : rooms.optJSONObject(room);
        if (r == null || notes.length() == 0) return;
        try {
            JSONObject n = newest(notes, r.optString("note"), r.optString("me"));
            r.put("note", notes.getJSONObject(0).optString("id"));
            JSONObject w = h.optJSONObject("words");
            JSONObject nw = w == null ? null : w.optJSONObject("note");
            if (n != null && nw != null && !front) {
                String title = fill(nw.optString("title"), "room", r.optString("name"));
                String body = fill(nw.optString("body"), "name", r.optJSONObject("names").optString(n.optString("from")), "text", n.optString("text"));
                if (onLap(h.optJSONObject("state"), h.optJSONObject("ring"), System.currentTimeMillis())) {
                    JSONObject waiting = h.optJSONObject("waiting");
                    if (waiting == null) h.put("waiting", waiting = new JSONObject());
                    waiting.put(room, new JSONObject().put("title", title).put("body", body));
                } else {
                    notify(c, room, NOTE, title, body);
                }
            }
        } catch (JSONException ignored) {
            // A note without an id: nothing shows.
        }
        save(c);
    }

    // The soonest call you are in, across rooms, as the call alarm.
    private static void calls(Context c, JSONObject h) throws JSONException {
        JSONObject rooms = h.optJSONObject("rooms");
        JSONObject w = h.optJSONObject("words");
        JSONObject sw = w == null ? null : w.optJSONObject("starts");
        if (sw == null) return;
        JSONObject next = null;
        for (Iterator<String> it = rooms == null ? null : rooms.keys(); it != null && it.hasNext(); ) {
            JSONObject r = rooms.optJSONObject(it.next());
            JSONObject in = r == null ? null : r.optJSONObject("in");
            if (in == null || (next != null && next.optLong("at") <= in.optLong("at") - h.optLong("offset"))) continue;
            String name = r.optString("name");
            String body = in.optString("by").equals(r.optString("me")) ? fill(sw.optString("body"), "room", name) : fill(sw.optString("with"), "room", name, "name", r.getJSONObject("names").optString(in.optString("by")));
            next = new JSONObject().put("id", in.optString("id")).put("at", in.optLong("at") - h.optLong("offset")).put("title", sw.optString("title")).put("body", body);
        }
        call(c, next, false);
    }

    /** The bell's alarm: show it, and the notes that waited for the lap's end. */
    static synchronized void rang(Context c, Intent i, BroadcastReceiver.PendingResult hold) {
        JSONObject h = held(c);
        channels(c, h.optJSONObject("words"));
        int id = i.getIntExtra("id", BELL);
        NotificationCompat.Builder n = builder(c, "bell", i.getStringExtra("title"), i.getStringExtra("body"), null, id);
        // Swiped away: the bell stops with it.
        n.setDeleteIntent(PendingIntent.getBroadcast(c, Receiver.HUSH.hashCode(), new Intent(c, Receiver.class).setAction(Receiver.HUSH), PendingIntent.FLAG_IMMUTABLE));
        n.setPriority(NotificationCompat.PRIORITY_HIGH);
        String run = i.getStringExtra("run");
        try {
            JSONArray answers = new JSONArray(i.getStringExtra("answers") == null ? "[]" : i.getStringExtra("answers"));
            for (int k = 0; k < answers.length(); k++) {
                JSONObject a = answers.getJSONObject(k);
                n.addAction(button(c, a.optString("act"), a.optString("label"), run, id));
            }
        } catch (JSONException ignored) {
            // No answers: the bell still rings.
        }
        show(c, null, id, n);
        Bell.ring(c, h.optJSONObject("ringing"), hold);
        flush(c, h);
        save(c);
    }

    // A button that carries an act to the page through ActionActivity, as the countdown's do.
    static NotificationCompat.Action button(Context c, String act, String label, String run, int bell) {
        Intent intent = new Intent(c, ActionActivity.class).putExtra(CountdownPlugin.ACT, act).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (run != null) intent.putExtra(CountdownPlugin.RUN, run);
        if (bell != 0) intent.putExtra(BELL_ID, bell);
        // One request code per act and notification, with FLAG_UPDATE_CURRENT: an older countdown's
        // button carries the newest run, which is right with one countdown; the page drops a run not
        // its own. The bell's two ids each have their own, so an answer clears its own bell.
        int code = COUNTDOWN + 10 + 10 * bell + java.util.Arrays.asList("pause", "resume", "stop", "break", "next", "rest").indexOf(act);
        PendingIntent pending = PendingIntent.getActivity(c, code, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Action.Builder(0, label, pending).build();
    }

    private static void flush(Context c, JSONObject h) {
        JSONObject waiting = h.optJSONObject("waiting");
        if (waiting == null) return;
        for (Iterator<String> it = waiting.keys(); it.hasNext(); ) {
            String room = it.next();
            JSONObject n = waiting.optJSONObject(room);
            if (n != null && !front) notify(c, room, NOTE, n.optString("title"), n.optString("body"));
        }
        h.remove("waiting");
    }

    /** After a reboot or an update: the alarms again, and the countdown, from what was kept. */
    static synchronized void rearm(Context c) {
        JSONObject h = held(c);
        long now = System.currentTimeMillis();
        JSONObject b = h.optJSONObject("bell");
        if (b != null && b.optLong("at") > now) exact(c, alarm(c, Receiver.BELL, b.optInt("id"), b), b.optLong("at"));
        JSONObject call = h.optJSONObject("call");
        if (call != null && call.optLong("at") > now) exact(c, alarm(c, Receiver.CALL, CALL, call), call.optLong("at"));
        JSONObject ring = h.optJSONObject("ring");
        if (ring != null && ring.optBoolean("paused")) countdown(c, ring, false);
        else if (ring != null && ring.has("during") && ring.optLong("at") > now) countdown(c, ring, true);
    }

    private static void notify(Context c, String room, int id, String title, String body) {
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open != null) open.putExtra(OPEN, "room");
        post(c, room, id, "rooms", title, body, open);
    }

    /** A called lap's alarm, at its minute. Its tap opens the app, which starts the lap if this phone is idle. */
    static void called(Context c, Intent i) {
        post(c, null, CALL, "remind", i.getStringExtra("title"), i.getStringExtra("body"), null);
    }

    private static void post(Context c, String tag, int id, String channel, String title, String body, Intent open) {
        show(c, tag, id, builder(c, channel, title, body, open, id));
    }

    private static NotificationCompat.Builder builder(Context c, String channel, String title, String body, Intent open, int code) {
        if (open == null) open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent tap = PendingIntent.getActivity(c, code, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(c, channel)
            .setSmallIcon(R.drawable.ic_stat_heirloom)
            .setColor(ContextCompat.getColor(c, R.color.you))
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(tap);
    }

    private static void show(Context c, String tag, int id, NotificationCompat.Builder n) {
        try {
            NotificationManagerCompat.from(c).notify(tag, id, n.build());
        } catch (SecurityException e) {
            // Notifications refused since: nothing to show it with.
        }
    }

    /**
     * A new call's text and button (DESIGN.md, "A bell you can answer"): the room's name with
     * "I'm in"; once in, "You're in. It starts at 15:00." with "I'm out"; after a try that did not
     * reach the server, "Could not reach your server." with the button it had. {text, label}.
     */
    static String[] form(JSONObject cw, String room, String time, boolean in, boolean failed) {
        String text = failed ? cw.optString("unreached") : in ? fill(cw.optString("youre"), "time", time) : fill(cw.optString("body"), "room", room);
        return new String[] { text, in ? cw.optString("out") : cw.optString("in") };
    }

    // The new call's notification in one of its forms. Its button is the service's one write.
    private static void announce(Context c, JSONObject cw, String room, String call, String title, String name, String time, boolean in, boolean failed) {
        String[] f = form(cw, name, time, in, failed);
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open != null) open.putExtra(OPEN, "room");
        NotificationCompat.Builder n = builder(c, "rooms", title, f[0], open, CALLED);
        Intent answer = new Intent(c, Receiver.class).setAction(Receiver.IN)
            .putExtra("room", room).putExtra("call", call).putExtra("in", !in)
            .putExtra("title", title).putExtra("name", name).putExtra("time", time);
        n.addAction(new NotificationCompat.Action.Builder(0, f[1], PendingIntent.getBroadcast(c, room.hashCode(), answer, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)).build());
        // Redrawn in place with new words: it buzzed once already.
        n.setOnlyAlertOnce(true);
        show(c, room, CALLED, n);
    }

    static final int JOINED = 0;
    static final int UNREACHED = 1;
    static final int OVER = 2;

    /** What came of "I'm in": JOINED on a 2xx; UNREACHED with no answer (null); OVER on any refusal, a 404 `call` most of all: the call has started or was taken back. */
    static int outcome(Integer status) {
        if (status == null) return UNREACHED;
        return status >= 200 && status < 300 ? JOINED : OVER;
    }

    /** "I'm in" or "I'm out" was tapped, and the server answered `status`, or nothing (null). */
    static synchronized void answered(Context c, Intent i, Integer status) {
        int outcome = outcome(status);
        String tag = i.getStringExtra("room");
        // The call is over or will not have you: its notification has nothing left to offer.
        if (outcome == OVER) {
            if (tag != null) NotificationManagerCompat.from(c).cancel(tag, CALLED);
            return;
        }
        boolean ok = outcome == JOINED;
        JSONObject h = held(c);
        JSONObject w = h.optJSONObject("words");
        JSONObject cw = w == null ? null : w.optJSONObject("call");
        String room = i.getStringExtra("room");
        String call = i.getStringExtra("call");
        boolean wanted = i.getBooleanExtra("in", true);
        if (cw == null || room == null || call == null) return;
        announce(c, cw, room, call, i.getStringExtra("title"), i.getStringExtra("name"), i.getStringExtra("time"), ok == wanted, !ok);
        JSONObject rooms = h.optJSONObject("rooms");
        JSONObject r = rooms == null ? null : rooms.optJSONObject(room);
        if (!ok || r == null || !call.equals(r.optString("call"))) return;
        try {
            // The server will say the same in the room's next message; the alarm need not wait for it.
            r.put("in", wanted ? new JSONObject().put("id", call).put("at", r.optLong("at")).put("by", r.optString("by")) : JSONObject.NULL);
            calls(c, h);
        } catch (JSONException ignored) {
            // put never throws for these values.
        }
        save(c);
    }

    private static void quiet(Context c, String room) {
        NotificationManagerCompat.from(c).cancel(room, NOTE);
        NotificationManagerCompat.from(c).cancel(room, CALLED);
    }

    static synchronized void channels(Context c) {
        channels(c, held(c).optJSONObject("words"));
    }

    /** The service's quiet channel and the rooms' channel, named from the page's words. Creating one again renames it. */
    // Made even without words: the service's notification on a channel that does not exist crashes
    // the app from inside Android, where nothing can catch it.
    static void channels(Context c, JSONObject w) {
        JSONObject names = w == null ? null : w.optJSONObject("channels");
        String app = c.getString(R.string.app_name);
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        nm.createNotificationChannel(new NotificationChannelCompat.Builder("keep", NotificationManagerCompat.IMPORTANCE_MIN).setName(names == null ? app : names.optString("keep", app)).setShowBadge(false).build());
        nm.createNotificationChannel(new NotificationChannelCompat.Builder("rooms", NotificationManagerCompat.IMPORTANCE_DEFAULT).setName(names == null ? app : names.optString("rooms", app)).build());
        // High, to show over the lock screen and as a heads-up, and silent: Bell plays the sound and
        // the buzz itself, so "Ring even on silent" can come through Mute.
        nm.createNotificationChannel(new NotificationChannelCompat.Builder("bell", NotificationManagerCompat.IMPORTANCE_HIGH).setName(names == null ? app : names.optString("bell", app))
            .setSound(null, null).setVibrationEnabled(false).build());
        for (String gone : GONE) nm.deleteNotificationChannel(gone);
    }

    // The countdown: running, a live countdown Android draws itself to `at` and takes away at the
    // end; paused, the time left standing still. Its buttons carry a tap to the page (ActionActivity).
    private static void countdown(Context c, JSONObject ring, boolean running) {
        long end = ring.optLong("at");
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent tap = PendingIntent.getActivity(c, COUNTDOWN, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(c, "countdown")
            .setSmallIcon(R.drawable.ic_stat_heirloom)
            .setColor(ContextCompat.getColor(c, R.color.you))
            .setContentTitle(ring.optString("during"))
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(tap);
        if (running) {
            builder.setWhen(end).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true).setTimeoutAfter(Math.max(1, end - System.currentTimeMillis()));
        } else {
            builder.setContentText(ring.optString("left")).setShowWhen(false);
        }
        JSONObject actions = ring.optJSONObject("actions");
        if (actions != null) {
            String run = actions.isNull("run") ? null : actions.optString("run");
            for (String act : running ? new String[] { "pause", "stop" } : new String[] { "resume", "stop" }) builder.addAction(button(c, act, actions.optString(act), run, 0));
        }
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        try {
            // The still form has its own id. The running form is posted with setTimeoutAfter, which
            // Android keeps as an alarm keyed by the notification; reposting that key without a timeout
            // does not take the alarm back before Android 14, so a paused one on the same id would
            // vanish when the old lap would have ended.
            nm.cancel(running ? PAUSED : COUNTDOWN);
            nm.notify(running ? COUNTDOWN : PAUSED, builder.build());
        } catch (SecurityException e) {
            // Not allowed to notify: the bell's own check says so; the countdown just is not shown.
        }
    }

    private static void clearCountdown(Context c) {
        NotificationManagerCompat.from(c).cancel(COUNTDOWN);
        NotificationManagerCompat.from(c).cancel(PAUSED);
    }

    private static AlarmManager alarms(Context c) {
        return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    }

    // The alarm's PendingIntent: one per request code, its words in the extras so the receiver needs no file.
    private static PendingIntent alarm(Context c, String action, int id, JSONObject words) {
        Intent i = new Intent(c, Receiver.class).setAction(action).putExtra("id", id);
        if (words != null) i.putExtra("title", words.optString("title")).putExtra("body", words.optString("body"));
        if (words != null && words.optJSONArray("answers") != null) i.putExtra("answers", words.optJSONArray("answers").toString());
        if (words != null && !words.isNull("run")) i.putExtra("run", words.optString("run"));
        return PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // setExactAndAllowWhileIdle with RTC_WAKEUP: exact, and it fires in Doze. Without the exact
    // permission (only Android 12 can refuse it) this throws rather than fall back to inexact.
    private static boolean exact(Context c, PendingIntent pi, long at) {
        try {
            alarms(c).setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    // The wall clock as strings.ts `wall` says it: "15:00".
    private static String wall(long ms) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(ms);
        return String.format(Locale.ROOT, "%02d:%02d", cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE));
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static Object orNull(Object o) {
        return o == null ? JSONObject.NULL : o;
    }

    private static AtomicFile file(Context c) {
        return new AtomicFile(new File(c.getNoBackupFilesDir(), "shade.json"));
    }

    private static JSONObject held(Context c) {
        if (held != null) return held;
        try {
            held = new JSONObject(new String(file(c).readFully(), StandardCharsets.UTF_8));
        } catch (IOException | JSONException e) {
            held = new JSONObject();
        }
        return held;
    }

    private static void save(Context c) {
        AtomicFile f = file(c);
        FileOutputStream out = null;
        try {
            out = f.startWrite();
            out.write(held(c).toString().getBytes(StandardCharsets.UTF_8));
            f.finishWrite(out);
        } catch (IOException e) {
            if (out != null) f.failWrite(out);
        }
    }
}
