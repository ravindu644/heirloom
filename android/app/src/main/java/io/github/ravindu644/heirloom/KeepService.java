package io.github.ravindu644.heirloom;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps the phone in step while heirloom is closed: a foreground service holding its own read-only
 * socket to /api/ws (protocol section 4), with the same token and device as the page. It hears the
 * timer and the rooms and hands them to Shade; it never pushes a cell.
 */
public class KeepService extends Service {

    // As transport.ts: a ping every 25 s keeps the tunnel open; a pong may take 10.
    static final long PING_MS = 25000;
    static final long PONG_MS = 10000;
    static final long HELLO_MS = 10000;

    private static final MediaType JSON = MediaType.get("application/json");
    // One for the process: a client per service would leave its threads and pool behind each time.
    // Short limits: "I'm in" holds a receiver, which Android ends after ten seconds.
    private static final OkHttpClient http = new OkHttpClient.Builder().callTimeout(8, TimeUnit.SECONDS).build();
    // Every socket event and timer runs here, one at a time, so none of the fields below is shared.
    private final ScheduledExecutorService loop = Executors.newSingleThreadScheduledExecutor();
    private WebSocket ws;
    private String as; // the server, token and device the socket says hello with
    private boolean live;
    private int failures;
    private long sent;
    private ScheduledFuture<?> hello, ping, pong, retry;
    private PowerManager.WakeLock lock;
    private ConnectivityManager.NetworkCallback net;
    private Network network;

    /** Starts the service when it is wanted, stops it when not. From the app, at boot and after an update. */
    static void sync(Context c) {
        Intent i = new Intent(c, KeepService.class);
        if (!Shade.wanted(c)) {
            c.stopService(i);
            return;
        }
        try {
            ContextCompat.startForegroundService(c, i);
        } catch (IllegalStateException e) {
            // ForegroundServiceStartNotAllowedException: started from the background where Android 12
            // will not have it. The next start from the app, a boot or an update tries again.
        }
    }

    /** Wait before try number `failures + 1`: as transport.ts, doubling from 1 s to 30 s, then half to all of it. */
    static long backoff(int failures, double random) {
        return (long) (Math.min(30000, 1000 * Math.pow(2, failures - 1)) * (0.5 + random / 2));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Shade.channels(this);
        // ponytail: a partial wakelock for as long as the socket is up, so a sleeping CPU does not
        // hold back the pings and the socket's reads. Its cost is the battery run's to show; if it is
        // too much, the follow-up pings from exact allow-while-idle alarms and lets the CPU sleep.
        lock = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "heirloom:keep");
        lock.setReferenceCounted(false);
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        net = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network now) {
                // The first call says which network there is; a new one after that is a move (Wi-Fi to
                // mobile), where the old socket is dead and nobody says so: say hello again at once.
                on(null, () -> {
                    boolean moved = network != null && !now.equals(network);
                    network = now;
                    if (moved || (ws == null && as != null)) {
                        failures = 0;
                        open();
                    }
                });
            }
        };
        cm.registerDefaultNetworkCallback(net);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Every start asks for the foreground again: Android wants it within 5 s of each one.
        if (!foreground() || !Shade.wanted(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        loop.execute(() -> {
            JSONObject l = Shade.link(this);
            String who = l.optString("server") + " " + l.optString("token") + " " + l.optString("device");
            if (who.equals(as)) return;
            as = who;
            failures = 0;
            open();
        });
        return START_STICKY;
    }

    private boolean foreground() {
        String title = Shade.words(this, "keeping");
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        Notification n = new NotificationCompat.Builder(this, "keep")
            .setSmallIcon(R.drawable.ic_stat_heirloom)
            .setContentTitle(title.isEmpty() ? getString(R.string.app_name) : title)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(PendingIntent.getActivity(this, Shade.KEEP, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .build();
        try {
            ServiceCompat.startForeground(this, Shade.KEEP, n, Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0);
            return true;
        } catch (RuntimeException e) {
            // ForegroundServiceStartNotAllowedException (a sticky restart from the background), or
            // notifications refused: the service does not run.
            return false;
        }
    }

    @Override
    public void onDestroy() {
        getSystemService(ConnectivityManager.class).unregisterNetworkCallback(net);
        loop.execute(() -> {
            as = null;
            drop();
        });
        loop.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void open() {
        drop();
        JSONObject l = Shade.link(this);
        Request req;
        try {
            // OkHttp takes http(s) and ws(s) alike for a socket.
            req = new Request.Builder().url(l.optString("server") + "/api/ws").build();
        } catch (IllegalArgumentException e) {
            stopSelf();
            return;
        }
        WebSocket[] mine = new WebSocket[1];
        mine[0] = ws = http.newWebSocket(req, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket w, Response r) {
                on(w, () -> {
                    sent = System.currentTimeMillis();
                    try {
                        w.send(new JSONObject().put("type", "hello").put("token", l.optString("token")).put("device", l.optString("device")).put("cursor", Shade.link(KeepService.this).optLong("cursor")).put("client_time", sent).toString());
                    } catch (JSONException ignored) {
                        // put never throws for these values.
                    }
                });
            }

            @Override
            public void onMessage(WebSocket w, String text) {
                on(w, () -> receive(w, text));
            }

            @Override
            public void onClosed(WebSocket w, int code, String reason) {
                on(w, KeepService.this::lost);
            }

            @Override
            public void onFailure(WebSocket w, Throwable t, Response r) {
                on(w, KeepService.this::lost);
            }
        });
        // From the moment it is made, so one that never opens is caught as well.
        hello = loop.schedule(() -> {
            if (ws == mine[0] && !live) lost();
        }, HELLO_MS, TimeUnit.MILLISECONDS);
    }

    // Runs on the loop; with a socket, only while it is still the one.
    private void on(WebSocket w, Runnable run) {
        try {
            loop.execute(() -> {
                if (w == null || w == ws) run.run();
            });
        } catch (RuntimeException e) {
            // The loop is shut: the service is gone.
        }
    }

    private void receive(WebSocket w, String text) {
        JSONObject m;
        try {
            m = new JSONObject(text);
        } catch (JSONException e) {
            return;
        }
        long now = System.currentTimeMillis();
        switch (m.optString("type")) {
            case "welcome":
                live = true;
                failures = 0;
                cancel(hello);
                Shade.offset(this, m.optLong("server_time") - (sent + now) / 2);
                Shade.welcome(this, m.optLong("head"), m.optJSONArray("rooms"));
                lock.acquire();
                ping = loop.schedule(this::ping, PING_MS, TimeUnit.MILLISECONDS);
                break;
            case "pong":
                cancel(pong);
                Shade.offset(this, m.optLong("server_time") - (m.optLong("t") + now) / 2);
                break;
            case "ping":
                w.send("{\"type\":\"pong\",\"t\":" + m.optLong("t") + "}");
                break;
            case "cells":
                // Something was missed: say hello again from the cursor.
                if (!Shade.cells(this, m.optLong("from"), m.optLong("to"), m.optJSONArray("cells"))) open();
                break;
            case "room":
                if (Shade.room(this, m)) notes(m.optString("room"));
                break;
            case "bye":
                if ("token".equals(m.optString("reason"))) {
                    Shade.refused(this);
                    as = null;
                    drop();
                    stopSelf();
                }
                break;
            default:
                // An unknown type is ignored (protocol section 4).
        }
    }

    // JSON pings of our own: the server answers these, and OkHttp's protocol pings it does not count.
    private void ping() {
        if (ws == null) return;
        ws.send("{\"type\":\"ping\",\"t\":" + System.currentTimeMillis() + "}");
        // No pong in time: the socket is dead and nobody said so. Phones do this.
        pong = loop.schedule(this::lost, PONG_MS, TimeUnit.MILLISECONDS);
        ping = loop.schedule(this::ping, PING_MS, TimeUnit.MILLISECONDS);
    }

    private void lost() {
        drop();
        if (as == null) return;
        failures += 1;
        retry = loop.schedule(this::open, backoff(failures, Math.random()), TimeUnit.MILLISECONDS);
    }

    private void drop() {
        WebSocket w = ws;
        ws = null;
        live = false;
        for (ScheduledFuture<?> f : new ScheduledFuture<?>[] { hello, ping, pong, retry }) cancel(f);
        if (lock != null) lock.release();
        if (w != null) w.cancel();
    }

    private static void cancel(ScheduledFuture<?> f) {
        if (f != null) f.cancel(false);
    }

    /**
     * "I'm in" or "I'm out" on a called lap (protocol section 15, `/api/rooms/in`): the service's one
     * write, with the kept token and device, as the page would send it. It writes no cell.
     */
    static void in(Context c, String room, String call, boolean in, java.util.function.Consumer<Integer> done) {
        JSONObject l = Shade.link(c);
        Request req;
        try {
            String body = new JSONObject().put("token", l.optString("token")).put("device", l.optString("device")).put("room", room).put("call", call).put("in", in).toString();
            req = new Request.Builder().url(l.optString("server") + "/api/rooms/in").post(RequestBody.create(body, JSON)).build();
        } catch (JSONException | IllegalArgumentException e) {
            done.accept(null);
            return;
        }
        http.newCall(req).enqueue(new Callback() {
            @Override
            public void onResponse(Call call, Response res) {
                res.close();
                done.accept(res.code());
            }

            @Override
            public void onFailure(Call call, IOException e) {
                done.accept(null);
            }
        });
    }

    // A room's notes (protocol section 15): fetched only to word a notification, never written.
    private void notes(String room) {
        JSONObject l = Shade.link(this);
        String body;
        try {
            body = new JSONObject().put("token", l.optString("token")).put("device", l.optString("device")).put("room", room).toString();
        } catch (JSONException e) {
            return;
        }
        Request req = new Request.Builder().url(l.optString("server") + "/api/rooms/notes").post(RequestBody.create(body, JSON)).build();
        http.newCall(req).enqueue(new Callback() {
            @Override
            public void onResponse(Call call, Response res) {
                try (res) {
                    if (!res.isSuccessful()) return;
                    JSONArray notes = new JSONObject(res.body().string()).optJSONArray("notes");
                    if (notes != null) Shade.notes(KeepService.this, room, notes);
                } catch (IOException | JSONException ignored) {
                    // The next room message tries again.
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                // Offline: the next room message tries again, since the note is still unseen.
            }
        });
    }
}
