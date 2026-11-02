package com.beta.sched;

import java.time.Instant;
import java.util.Objects;

/**
 * 不可变任务。
 *
 * <p>GAS_RELEASE 任务由调度器交给 DispatchGuard 下发，action 可以为 null；
 * GENERIC 任务执行 action。
 */
public final class Task {

    public enum Type {
        GENERIC,
        GAS_RELEASE
    }

    private final String id;
    private final Instant fireAt;
    private final Type type;
    private final String zone;
    private final Runnable action;

    public Task(String id, Instant fireAt, Type type, String zone, Runnable action) {
        this.id = Objects.requireNonNull(id, "id");
        this.fireAt = Objects.requireNonNull(fireAt, "fireAt");
        this.type = Objects.requireNonNull(type, "type");
        this.zone = Objects.requireNonNull(zone, "zone");
        this.action = action;
    }

    public String id() {
        return id;
    }

    public Instant fireAt() {
        return fireAt;
    }

    public Type type() {
        return type;
    }

    public String zone() {
        return zone;
    }

    public Runnable action() {
        return action;
    }
}
