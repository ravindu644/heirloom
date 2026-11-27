package io.github.ravindu644.heirloom;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** The drawer's decisions, on the JVM: the same rules capacitor.test.ts held when the page drew. */
public class ShadeTest {

    private static final long T0 = 1800000000000L;
    private static final long MIN = 60000;

    // The tests compile against android.jar's org.json, whose JSONException is checked.
    private static JSONObject json(String s) {
        try {
            return new JSONObject(s);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static JSONObject ring(long at, String title) throws Exception {
        return new JSONObject().put("at", at).put("title", title).put("body", "Take five.").put("during", "Lap 1 today");
    }

    private static JSONObject given(int id, long at, String title) throws Exception {
        return new JSONObject().put("id", id).put("at", at).put("title", title).put("body", "Take five.");
    }

    private static final JSONObject WORDS = json("{"
        + "\"bell\":{\"lap\":[\"Lap done.\",\"Lap done.\",\"Lap done.\",\"Lap done.\"],"
        + "\"take\":[\"Take five.\",\"Take five.\",\"Take five.\",\"Take 15 minutes.\"],"
        + "\"next\":[\"Time for the next lap.\",\"Time for the next lap.\",\"Time for the next lap.\",\"Time for the next lap.\"],"
        + "\"break\":\"Break over.\"},"
        + "\"during\":{\"work\":\"A lap\",\"short\":\"Short break\",\"long\":\"Long break\"},"
        + "\"actions\":{\"pause\":\"Pause\",\"resume\":\"Resume\",\"stop\":\"Stop\",\"done\":\"Done for now\"},"
        + "\"answer\":{\"break\":[\"Take five\",\"Take five\",\"Take five\",\"Take 15 minutes\"],\"next\":\"Start the next lap\",\"rest\":\"Done for now\"},"
        + "\"call\":{\"title\":\"{name} calls a lap at {time}\",\"body\":\"{room}\",\"in\":\"I'm in\",\"out\":\"I'm out\","
        + "\"youre\":\"You're in. It starts at {time}.\",\"unreached\":\"Could not reach your server.\"},"
        + "\"left\":\"Paused, {t} left\"}");

    private static JSONObject lap(long started, int set) throws Exception {
        return new JSONObject().put("phase", "work").put("run", "run-1").put("task", JSONObject.NULL).put("started", started)
            .put("paused_at", JSONObject.NULL).put("paused_ms", 0).put("planned_ms", 25 * MIN).put("set_index", set);
    }

    @Test
    public void theViewMatchesTimerJsonWhereverTheStateIsKnown() throws Exception {
        JSONObject fixture = new JSONObject(new String(Files.readAllBytes(Paths.get("../../contracts/fixtures/timer.json")), StandardCharsets.UTF_8));
        JSONArray cases = fixture.getJSONArray("cases");
        int checked = 0;
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            // The drawer only reads a state; it never acts on one. A step after an action is checked
            // once an expect names the whole state again.
            JSONObject state = c.has("from") ? c.getJSONObject("from") : json("{\"phase\":\"idle\",\"run\":null,\"task\":null,\"started\":null,\"paused_at\":null,\"paused_ms\":0,\"planned_ms\":0,\"set_index\":0}");
            JSONArray steps = c.getJSONArray("steps");
            for (int j = 0; j < steps.length(); j++) {
                JSONObject step = steps.getJSONObject(j);
                if (step.has("do")) {
                    state = null;
                    continue;
                }
                JSONObject expect = step.getJSONObject("expect");
                if (expect.has("state")) state = expect.getJSONObject("state");
                if (state == null) continue;
                Shade.View v = Shade.view(state, step.getLong("at"));
                String where = c.getString("name") + ", step " + j;
                if (expect.has("left_ms")) assertEquals(where, expect.getLong("left_ms"), v.left);
                if (expect.has("ends_at")) assertEquals(where, expect.isNull("ends_at") ? -1 : expect.getLong("ends_at"), v.ends);
                if (expect.has("over")) assertEquals(where, expect.getBoolean("over"), v.over);
                if (expect.has("paused")) assertEquals(where, expect.getBoolean("paused"), v.paused);
                checked++;
            }
        }
        assertTrue("checked " + checked, checked >= 25);
    }

    @Test
    public void theNewerStampWinsAndThePageWinsATie() throws Exception {
        assertTrue(Shade.takes("", "2026-11-27T10:00:00.000Z-0000-aa", false));
        assertTrue(Shade.takes(null, "2026-11-27T10:00:00.000Z-0000-aa", true));
        assertTrue(Shade.takes("2026-11-27T10:00:00.000Z-0000-aa", "2026-11-27T10:00:01.000Z-0000-bb", false));
        assertFalse("an older stamp is ignored", Shade.takes("2026-11-27T10:00:01.000Z-0000-bb", "2026-11-27T10:00:00.000Z-0000-aa", true));
        assertTrue("the page's words replace the templates", Shade.takes("2026-11-27T10:00:00.000Z-0000-aa", "2026-11-27T10:00:00.000Z-0000-aa", true));
        assertFalse("the service never replaces the page's words for the same cell", Shade.takes("2026-11-27T10:00:00.000Z-0000-aa", "2026-11-27T10:00:00.000Z-0000-aa", false));
        assertTrue("a page with no timer cell yet, after a wipe", Shade.takes("", null, true));
    }

    @Test
    public void anotherServerAccountOrTokenWipesAndNothingElseDoes() throws Exception {
        JSONObject held = json("{\"server\":\"https://a\",\"account\":\"a_1\",\"token\":\"t\",\"device\":\"d\",\"on\":true}");
        assertFalse(Shade.wipes(held, json("{\"server\":\"https://a\",\"account\":\"a_1\",\"token\":\"t\",\"device\":\"d\",\"on\":false}")));
        assertTrue(Shade.wipes(held, json("{\"server\":\"https://b\",\"account\":\"a_1\",\"token\":\"t\"}")));
        assertTrue(Shade.wipes(held, json("{\"server\":\"https://a\",\"account\":\"a_2\",\"token\":\"t\"}")));
        assertTrue(Shade.wipes(held, json("{\"server\":\"https://a\",\"account\":\"a_1\",\"token\":\"u\"}")));
        assertTrue("a first keep on a fresh install", Shade.wipes(new JSONObject(), held));
    }

    @Test
    public void aFirstBellGoesOnTheFirstId() throws Exception {
        assertArrayEquals(new int[] { 0, 1 }, Shade.bell(null, ring(T0 + 25 * MIN, "Lap done."), T0, false));
        assertArrayEquals(new int[] { 0, 0 }, Shade.bell(null, null, T0, false));
    }

    @Test
    public void aNewPlanTakesTheOldOnesPlaceOnTheSameId() throws Exception {
        assertArrayEquals(new int[] { 1, 1 }, Shade.bell(given(1, T0 + 25 * MIN, "Lap done."), ring(T0 + 30 * MIN, "Lap done."), T0, false));
        assertArrayEquals(new int[] { 2, 2 }, Shade.bell(given(2, T0 + 25 * MIN, "Lap done."), ring(T0 + 30 * MIN, "Lap done."), T0, false));
    }

    @Test
    public void aStopBeforeTheBellCancelsIt() throws Exception {
        assertArrayEquals(new int[] { 1, 0 }, Shade.bell(given(1, T0 + 25 * MIN, "Lap done."), null, T0, false));
    }

    @Test
    public void theSameBellIsLeftAsItIsAndOtherWordsSetItAgain() throws Exception {
        assertArrayEquals(new int[] { 0, 0 }, Shade.bell(given(1, T0 + 25 * MIN, "Lap done."), ring(T0 + 25 * MIN, "Lap done."), T0, false));
        assertArrayEquals(new int[] { 1, 1 }, Shade.bell(given(1, T0 + 25 * MIN, "Lap done."), ring(T0 + 25 * MIN, "Lap 2 done: Pointers"), T0, false));
    }

    @Test
    public void aBellWhoseTimeHasComeIsLeftToAndroid() throws Exception {
        long at = T0 + 25 * MIN;
        // The timer stops running at the bell and plans nothing, even if Android is late.
        assertArrayEquals(new int[] { 0, 0 }, Shade.bell(given(1, at, "Lap done."), null, at - 500, false));
        assertArrayEquals(new int[] { 0, 0 }, Shade.bell(given(1, at, "Lap done."), null, at + 3 * MIN, false));
        // The break started by itself goes on the other id, so the lap still rings.
        assertArrayEquals(new int[] { 0, 2 }, Shade.bell(given(1, at, "Lap done."), ring(at + 5 * MIN, "Break over."), at, false));
        // And the ids take turns: no more than two bells are ever held.
        assertArrayEquals(new int[] { 0, 1 }, Shade.bell(given(2, at + 5 * MIN, "Break over."), ring(at + 30 * MIN, "Lap done."), at + 5 * MIN, false));
    }

    @Test
    public void aTimerHeardByTheServiceIsWordedFromTheTemplates() throws Exception {
        long offset = 1500; // the server is 1.5 s ahead of this phone
        JSONObject r = Shade.ringFor(lap(T0, 3), WORDS, T0 + MIN, offset);
        assertEquals(T0 + 25 * MIN - offset, r.getLong("at"));
        assertEquals("Lap done.", r.getString("title"));
        assertEquals("the fourth lap's bell names the long break", "Take 15 minutes.", r.getString("body"));
        assertEquals("A lap", r.getString("during"));
        assertEquals("Stop", r.getJSONObject("actions").getString("stop"));
        assertEquals("run-1", r.getJSONObject("actions").getString("run"));

        JSONObject paused = lap(T0, 0).put("paused_at", T0 + 5 * MIN);
        JSONObject p = Shade.ringFor(paused, WORDS, T0 + 9 * MIN, 0);
        assertTrue(p.getBoolean("paused"));
        assertEquals("Paused, 20:00 left", p.getString("left"));

        JSONObject brk = lap(T0, 1).put("phase", "short").put("planned_ms", 5 * MIN);
        JSONObject b = Shade.ringFor(brk, WORDS, T0, 0);
        assertEquals("Break over.", b.getString("title"));
        assertEquals("Short break", b.getString("during"));
        assertEquals("Done for now", b.getJSONObject("actions").getString("stop"));

        assertNull(Shade.ringFor(json("{\"phase\":\"idle\",\"set_index\":2}"), WORDS, T0, 0));
        assertNull("no templates yet: nothing is guessed", Shade.ringFor(lap(T0, 0), null, T0, 0));
    }

    @Test
    public void theClockReadsAsTheAppsDoes() throws Exception {
        assertEquals("25:00", Shade.clock(25 * MIN));
        assertEquals("00:01", Shade.clock(1));
        assertEquals("00:00", Shade.clock(0));
        assertEquals("1:40:00", Shade.clock(100 * MIN));
    }

    @Test
    public void ringHereOffTakesBackEvenABellWhoseTimeHasCome() throws Exception {
        long at = T0 + 25 * MIN;
        assertArrayEquals(new int[] { 1, 0 }, Shade.bell(given(1, at, "Lap done."), null, at + 3 * MIN, true));
        assertArrayEquals(new int[] { 2, 0 }, Shade.bell(given(2, at + 5 * MIN, "Break over."), ring(at + 5 * MIN, "Break over."), at, true));
        assertArrayEquals(new int[] { 0, 0 }, Shade.bell(null, null, at, true));
    }

    @Test
    public void thePagesNullLeavesACallTheServiceSetAndTheServicesOwnNullTakesItBack() throws Exception {
        JSONObject held = call("c1", T0 + 10 * MIN).put("from", "keep");
        assertEquals("the page, opening, before it has heard its rooms", Shade.LEAVE, Shade.call(held, null, T0, true));
        assertEquals(Shade.OFF, Shade.call(held, null, T0, false));
        assertEquals("a call the page set is the page's to take back", Shade.OFF, Shade.call(call("c1", T0 + 10 * MIN).put("from", "page"), null, T0, true));
        assertEquals("the page's own call replaces it", Shade.SET, Shade.call(held, call("c2", T0 + 20 * MIN), T0, true));
    }

    @Test
    public void aCallIsNewsOnlyWhileItIsStillToComeAndFromSomeoneElse() throws Exception {
        JSONObject c = new JSONObject().put("id", "c1").put("by", "a_lina").put("at", T0 + 10 * MIN);
        assertTrue(Shade.news(c, "c0", "a_me", 0, T0));
        assertFalse("seen", Shade.news(c, "c1", "a_me", 0, T0));
        assertFalse("my own", Shade.news(c, "c0", "a_lina", 0, T0));
        assertFalse("its minute passed while the socket was down", Shade.news(c, "c0", "a_me", 0, T0 + 11 * MIN));
        assertFalse("the server's clock is ahead: at, in this phone's time, has passed", Shade.news(c, "c0", "a_me", 2 * MIN, T0 + 9 * MIN));
        assertFalse(Shade.news(null, "c0", "a_me", 0, T0));
    }

    private static JSONObject call(String id, long at) throws Exception {
        return new JSONObject().put("id", id).put("at", at).put("title", "The lap together starts").put("body", "Sachi and me, with lina");
    }

    @Test
    public void aCalledLapIsSetReplacedAndTakenBack() throws Exception {
        assertEquals(Shade.SET, Shade.call(null, call("c1", T0 + 10 * MIN), T0, true));
        assertEquals(Shade.LEAVE, Shade.call(call("c1", T0 + 10 * MIN), call("c1", T0 + 10 * MIN + 40), T0, true));
        assertEquals("a new call replaces the last", Shade.SET, Shade.call(call("c1", T0 + 10 * MIN), call("c2", T0 + 20 * MIN), T0, true));
        assertEquals("taken back before its minute: off, and out of the shade", Shade.OFF, Shade.call(call("c1", T0 + 10 * MIN), null, T0, true));
        assertEquals(Shade.LEAVE, Shade.call(null, null, T0, true));
    }

    @Test
    public void aCallWhoseMinuteHasComeIsLeftInTheShade() throws Exception {
        long at = T0 + 10 * MIN;
        assertEquals("one already past sets nothing", Shade.LEAVE, Shade.call(null, call("c1", at), at + 1, true));
        assertEquals("the same call again after its minute", Shade.LEAVE, Shade.call(call("c1", at), call("c1", at), at + MIN, true));
        assertEquals("the call over: forgotten, left in the shade", Shade.FORGET, Shade.call(call("c1", at), null, at + 2 * MIN, true));
    }

    @Test
    public void aNoteIsNewWhenSomeoneElseWroteItAfterTheLastSeen() throws Exception {
        JSONArray notes = new JSONArray("[{\"id\":\"n4\",\"from\":\"a_me\",\"text\":\"mine\"},{\"id\":\"n3\",\"from\":null,\"text\":\"left\"},"
            + "{\"id\":\"n2\",\"from\":\"a_sachi\",\"text\":\"Lost puppies\"},{\"id\":\"n1\",\"from\":\"a_lina\",\"text\":\"old\"}]");
        assertEquals("n2", Shade.newest(notes, "n1", "a_me").getString("id"));
        assertNull("nothing newer than the last seen", Shade.newest(notes, "n4", "a_me"));
        assertNull("only my own since", Shade.newest(notes, "n3", "a_me"));
        assertEquals("n2", Shade.newest(notes, null, "a_me").getString("id"));
    }

    @Test
    public void aNoteWaitsWhileAWorkLapRuns() throws Exception {
        JSONObject r = Shade.ringFor(lap(T0, 0), WORDS, T0, 0);
        assertTrue(Shade.onLap(lap(T0, 0), r, T0 + MIN));
        assertFalse("the lap has rung", Shade.onLap(lap(T0, 0), r, T0 + 26 * MIN));
        JSONObject paused = lap(T0, 0).put("paused_at", T0 + MIN);
        assertFalse("paused", Shade.onLap(paused, Shade.ringFor(paused, WORDS, T0 + 2 * MIN, 0), T0 + 2 * MIN));
        JSONObject brk = lap(T0, 0).put("phase", "short").put("planned_ms", 5 * MIN);
        assertFalse("a break", Shade.onLap(brk, Shade.ringFor(brk, WORDS, T0, 0), T0 + MIN));
        assertFalse("idle", Shade.onLap(null, null, T0));
    }

    @Test
    public void theCursorMovesToEachFramesEndAndNeverBack() throws Exception {
        assertEquals(1049, Shade.cursor(1042, 1042, 1049));
        assertEquals("a frame it already has", 1049, Shade.cursor(1049, 1040, 1045));
        assertEquals("from past the cursor: something was missed", -1, Shade.cursor(1042, 1045, 1050));
    }

    @Test
    public void backoffDoublesToThirtySecondsWithHalfToAllOfIt() throws Exception {
        assertEquals(500, KeepService.backoff(1, 0));
        assertEquals(1000, KeepService.backoff(1, 1));
        assertEquals(8000, KeepService.backoff(4, 1));
        assertEquals(30000, KeepService.backoff(12, 1));
        assertEquals(15000, KeepService.backoff(12, 0));
    }

    @Test
    public void theServerOffsetIsSmoothedAndAJumpTakenWhole() throws Exception {
        assertEquals(400, Shade.smooth(null, 400));
        assertEquals(500, Shade.smooth(400L, 800));
        assertEquals(9000, Shade.smooth(400L, 9000));
    }

    @Test
    public void aLapsBellOffersItsBreakAndABreaksBellTheNextLapBothWithDoneForNow() throws Exception {
        JSONArray lap = Shade.ringFor(lap(T0, 3), WORDS, T0, 0).getJSONArray("answers");
        assertEquals("break", lap.getJSONObject(0).getString("act"));
        assertEquals("the fourth lap earns the long break", "Take 15 minutes", lap.getJSONObject(0).getString("label"));
        assertEquals("rest", lap.getJSONObject(1).getString("act"));
        assertEquals("Done for now", lap.getJSONObject(1).getString("label"));
        JSONObject brk = lap(T0, 1).put("phase", "short").put("planned_ms", 5 * MIN);
        JSONArray after = Shade.ringFor(brk, WORDS, T0, 0).getJSONArray("answers");
        assertEquals("next", after.getJSONObject(0).getString("act"));
        assertEquals("Start the next lap", after.getJSONObject(0).getString("label"));
        assertEquals("rest", after.getJSONObject(1).getString("act"));
        assertEquals("no templates: no answers, the bell still rings", 0, Shade.answers(null, true, 0, false).length());
    }

    @Test
    public void theBellRingsAsAnAlarmOnSilentAndFollowsThePhonesModeOtherwise() throws Exception {
        assertEquals(android.media.AudioAttributes.USAGE_ALARM, Bell.usage(Bell.silent(null)));
        assertEquals(android.media.AudioAttributes.USAGE_ALARM, Bell.usage(Bell.silent(json("{\"silent\":true}"))));
        assertEquals(android.media.AudioAttributes.USAGE_NOTIFICATION_EVENT, Bell.usage(Bell.silent(json("{\"silent\":false}"))));
        assertTrue("on unless switched off", Bell.buzzes(null));
        assertTrue(Bell.buzzes(json("{\"sound\":\"chime\"}")));
        assertFalse(Bell.buzzes(json("{\"vibrate\":false}")));
        assertArrayEquals("two long, one short", new long[] { 0, 400, 200, 400, 200, 150 }, Bell.BUZZ);
    }

    @Test
    public void aCalledLapsNotificationAfterImInAndAfterAFailedTry() throws Exception {
        JSONObject cw = WORDS.getJSONObject("call");
        assertArrayEquals(new String[] { "Sachi and me", "I'm in" }, Shade.form(cw, "Sachi and me", "15:00", false, false));
        assertArrayEquals("in: the time, and the way out", new String[] { "You're in. It starts at 15:00.", "I'm out" }, Shade.form(cw, "Sachi and me", "15:00", true, false));
        assertArrayEquals("not reached: the button stays", new String[] { "Could not reach your server.", "I'm in" }, Shade.form(cw, "Sachi and me", "15:00", false, true));
        assertArrayEquals(new String[] { "Could not reach your server.", "I'm out" }, Shade.form(cw, "Sachi and me", "15:00", true, true));
    }

    @Test
    public void theOldRingChannelIsDeleted() {
        assertTrue(java.util.Arrays.asList(Shade.GONE).contains("ring"));
    }

    @Test
    public void aBellWhoseNextPhaseStartsByItselfOffersOnlyDoneForNow() throws Exception {
        JSONObject both = json("{\"break\":true,\"work\":true}");
        JSONArray lap = Shade.ringFor(lap(T0, 0), WORDS, T0, 0, both).getJSONArray("answers");
        assertEquals(1, lap.length());
        assertEquals("rest", lap.getJSONObject(0).getString("act"));
        JSONObject shortBreak = lap(T0, 1).put("phase", "short").put("planned_ms", 5 * MIN);
        assertEquals(1, Shade.ringFor(shortBreak, WORDS, T0, 0, both).getJSONArray("answers").length());
        JSONObject longBreak = lap(T0, 3).put("phase", "long").put("planned_ms", 15 * MIN);
        assertEquals("a long break never chains into the next set", 2, Shade.ringFor(longBreak, WORDS, T0, 0, both).getJSONArray("answers").length());
        assertEquals("auto_break alone leaves a break's bell as it was", 2, Shade.ringFor(shortBreak, WORDS, T0, 0, json("{\"break\":true,\"work\":false}")).getJSONArray("answers").length());
    }

    @Test
    public void iAmInSaysUnreachedOnlyWhenNothingAnsweredAndDropsACallThatIsOver() {
        assertEquals(Shade.JOINED, Shade.outcome(200));
        assertEquals(Shade.UNREACHED, Shade.outcome(null));
        assertEquals("404 call: it has started or was taken back", Shade.OVER, Shade.outcome(404));
        assertEquals(Shade.OVER, Shade.outcome(500));
    }

    @Test
    public void howThePhoneRingsOutlivesAWipe() throws Exception {
        JSONObject h = json("{\"token\":\"t\",\"stamp\":\"s\",\"ringing\":{\"sound\":\"chime\",\"vibrate\":false,\"silent\":false}}");
        JSONObject after = Shade.wiped(h);
        assertEquals("chime", after.getJSONObject("ringing").getString("sound"));
        assertFalse(after.has("token"));
        assertFalse(after.has("stamp"));
        assertEquals(0, Shade.wiped(new JSONObject()).length());
    }

    @Test
    public void aBellArmedWithoutItsAnswersIsArmedAgainWithThem() throws Exception {
        long at = T0 + 25 * MIN;
        JSONArray answers = new JSONArray("[{\"act\":\"break\",\"label\":\"Take five\"},{\"act\":\"rest\",\"label\":\"Done for now\"}]");
        JSONObject r = ring(at, "Lap done.").put("answers", answers).put("actions", new JSONObject().put("run", "run-1"));
        JSONObject old = given(1, at, "Lap done.");
        assertArrayEquals("armed by an earlier build", new int[] { 1, 1 }, Shade.bell(old, r, T0, false));
        JSONObject armed = given(1, at, "Lap done.").put("answers", answers).put("run", "run-1");
        assertArrayEquals(new int[] { 0, 0 }, Shade.bell(armed, r, T0, false));
        assertArrayEquals("another run's bell at the same moment", new int[] { 1, 1 }, Shade.bell(armed, ring(at, "Lap done.").put("answers", answers).put("actions", new JSONObject().put("run", "run-2")), T0, false));
    }
}
