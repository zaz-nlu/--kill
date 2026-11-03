package com.beta.sched;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ConcurrentNavigableMap;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 按时间窗批量取任务的调度器。
 *
 * <p>登记的是任务的 fireAt，执行时机却是它所在时间窗的收盘时刻。
 * 窗口宽 15 分钟，左闭右开，边界对齐到整刻（:00、:15、:30、:45）。
 * 例如 fireAt=22:12 的任务，在 22:15:00 被取出。
 *
 * <p>取数时先用 subMap 视图圈定窗口，再用 pollFirstEntry 原子出队，
 * 每条任务只会被执行一次。复杂度 O(log n + k)，k 为本次取出的任务数。
 *
 * <p>tick 只应由一个 ticker 线程调用。
 */
// 窗口取数，不保证窗口内先后。批量下发用，不是闹钟。
public final class WindowScheduler implements AutoCloseable {

    private static final Duration WINDOW = Duration.ofMinutes(15);

    private final Clock clock;
    private final DispatchGuard guard;
    private final ConcurrentSkipListMap<Instant, Queue<Task>> pending =
            new ConcurrentSkipListMap<Instant, Queue<Task>>();
    private final ConcurrentSkipListMap<Instant, Task> exact =
            new ConcurrentSkipListMap<Instant, Task>();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "window-scheduler");
        thread.setDaemon(true);
        return thread;
    });

    private volatile Instant lastBoundary;

    public WindowScheduler(Clock clock, FireGateway fireGateway) {
        this.clock = clock;
        this.guard = new DispatchGuard(fireGateway);
        this.lastBoundary = boundaryOf(clock.instant());
    }

    /** 登记任务；同一个 fireAt 的任务进入同一个队列。 */
    public void register(Task task) {
        pending.computeIfAbsent(task.fireAt(), key -> new ConcurrentLinkedQueue<Task>()).add(task);
    }

    public void registerExact(Task task) {
        synchronized (exact) { exact.put(task.fireAt(), task); }
    }

    /** 由 ticker 每秒调用；只有跨过窗口边界时才取数。 */
    public void tick(Instant now) {
        drainExact(now);
        Instant boundary = boundaryOf(now);
        while (lastBoundary.isBefore(boundary)) {
            Instant windowStart = lastBoundary;
            Instant windowEnd = windowStart.plus(WINDOW);
            drain(windowStart, windowEnd);
            lastBoundary = windowEnd;
        }
    }

    private void drainExact(Instant now) {
        ConcurrentNavigableMap<Instant, Task> due = exact.headMap(now, true);
        Map.Entry<Instant, Task> entry;
        while ((entry = due.pollFirstEntry()) != null) {
            Task t = entry.getValue();
            System.out.println("exact fire " + t.id());
            dispatchExact(t);
        }
    }

    private void dispatchExact(Task task) {
        if (task.type() == Task.Type.GAS_RELEASE) {
            guard.releaseNow(task.zone());
        } else {
            dispatch(task);
        }
    }

    private void drain(Instant windowStart, Instant windowEnd) {
        ConcurrentNavigableMap<Instant, Queue<Task>> window =
                pending.subMap(windowStart, true, windowEnd, false);
        Map.Entry<Instant, Queue<Task>> entry;
        while ((entry = window.pollFirstEntry()) != null) {
            for (Task task : entry.getValue()) {
                try {
                    dispatch(task);
                } catch (RuntimeException e) {
                    System.err.println("task " + task.id() + " failed: " + e);
                }
            }
        }
    }

    private void dispatch(Task task) {
        if (task.type() == Task.Type.GAS_RELEASE) {
            guard.release(task.zone(), 0);
            return;
        }
        Runnable action = task.action();
        if (action != null) {
            action.run();
        }
    }

    private static Instant boundaryOf(Instant instant) {
        long windowSeconds = WINDOW.getSeconds();
        long epochSecond = instant.getEpochSecond();
        return Instant.ofEpochSecond(epochSecond - Math.floorMod(epochSecond, windowSeconds));
    }

    public void start() {
        ticker.scheduleAtFixedRate(this::tickSafely, 0L, 1L, TimeUnit.SECONDS);
    }

    private void tickSafely() {
        try {
            tick(clock.instant());
        } catch (RuntimeException e) {
            System.err.println("scheduler tick failed: " + e);
        }
    }

    @Override
    public void close() {
        ticker.shutdownNow();
    }
}
