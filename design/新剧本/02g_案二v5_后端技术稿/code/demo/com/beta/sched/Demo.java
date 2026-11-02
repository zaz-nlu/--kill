package com.beta.sched;

import java.lang.reflect.Method;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * 手动时钟演示：不等待，逐秒推进调度器。
 *
 * <p>用法：java com.beta.sched.Demo original|patched
 */
public final class Demo {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final String TASK_ID = "TASK-1118-1736";
    private static final String ZONE_NAME = "SR-1";

    private Demo() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1 || (!"original".equals(args[0]) && !"patched".equals(args[0]))) {
            System.err.println("usage: Demo original|patched");
            System.exit(2);
        }
        String mode = args[0];

        Instant start = OffsetDateTime.parse("2026-11-18T22:11:59+08:00").toInstant();
        Instant fireAt = OffsetDateTime.parse("2026-11-18T22:12:00+08:00").toInstant();
        Instant end = OffsetDateTime.parse("2026-11-18T22:16:00+08:00").toInstant();

        ManualClock clock = new ManualClock(start, ZONE);
        RecordingGateway gateway = new RecordingGateway(clock);
        WindowScheduler scheduler = new WindowScheduler(clock, gateway);
        Task task = new Task(TASK_ID, fireAt, Task.Type.GAS_RELEASE, ZONE_NAME, null);

        if ("original".equals(mode)) {
            scheduler.register(task);
        } else {
            Method registerExact = WindowScheduler.class.getMethod("registerExact", Task.class);
            registerExact.invoke(scheduler, task);
        }

        Instant cursor = start;
        while (!cursor.isAfter(end)) {
            clock.set(cursor);
            scheduler.tick(cursor);
            cursor = cursor.plusSeconds(1);
        }
        scheduler.close();

        boolean original = "original".equals(mode);
        Instant expectedAt = OffsetDateTime.parse(original
                ? "2026-11-18T22:15:00+08:00"
                : "2026-11-18T22:12:00+08:00").toInstant();
        int expectedDelay = original ? 30 : 0;
        FireGateway.Broadcast expectedBroadcast = original
                ? FireGateway.Broadcast.ALL
                : FireGateway.Broadcast.ROOM_ONLY;

        check(gateway.calls() == 1, "expected exactly one release, got " + gateway.calls());
        check(ZONE_NAME.equals(gateway.zone()), "unexpected zone: " + gateway.zone());
        check(expectedAt.equals(gateway.releasedAt()),
                "expected release at " + expectedAt + ", got " + gateway.releasedAt());
        check(gateway.delaySeconds() == expectedDelay,
                "expected delay " + expectedDelay + ", got " + gateway.delaySeconds());
        check(expectedBroadcast == gateway.broadcast(),
                "expected broadcast " + expectedBroadcast + ", got " + gateway.broadcast());

        System.out.println(mode + ": " + gateway.zone() + " released at "
                + ZonedDateTime.ofInstant(gateway.releasedAt(), ZONE)
                + " delay=" + gateway.delaySeconds()
                + " broadcast=" + gateway.broadcast());
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            System.err.println("ASSERT FAILED: " + message);
            System.exit(1);
        }
    }

    private static final class ManualClock extends Clock {

        private final ZoneId zone;
        private Instant instant;

        private ManualClock(Instant instant, ZoneId zone) {
            this.instant = instant;
            this.zone = zone;
        }

        private void set(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new ManualClock(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }

    private static final class RecordingGateway implements FireGateway {

        private final Clock clock;
        private int calls;
        private Instant releasedAt;
        private String zone;
        private int delaySeconds;
        private Broadcast broadcast;

        private RecordingGateway(Clock clock) {
            this.clock = clock;
        }

        @Override
        public void release(String zone, int delaySeconds, Broadcast broadcast) {
            calls++;
            if (releasedAt == null) {
                this.releasedAt = clock.instant();
                this.zone = zone;
                this.delaySeconds = delaySeconds;
                this.broadcast = broadcast;
            }
        }

        private int calls() {
            return calls;
        }

        private Instant releasedAt() {
            return releasedAt;
        }

        private String zone() {
            return zone;
        }

        private int delaySeconds() {
            return delaySeconds;
        }

        private Broadcast broadcast() {
            return broadcast;
        }
    }
}
