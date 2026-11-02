package com.beta.sched;

/**
 * 气体灭火任务的唯一出口：强制预喷放延时与全楼广播。
 */
public final class DispatchGuard {

    private static final int MIN_DELAY_SECONDS = 30;

    private final FireGateway gateway;

    public DispatchGuard(FireGateway gateway) {
        this.gateway = gateway;
    }

    public void release(String zone, int requestedDelaySeconds) {
        int delaySeconds = Math.max(MIN_DELAY_SECONDS, requestedDelaySeconds);
        gateway.release(zone, delaySeconds, FireGateway.Broadcast.ALL);
    }
}
