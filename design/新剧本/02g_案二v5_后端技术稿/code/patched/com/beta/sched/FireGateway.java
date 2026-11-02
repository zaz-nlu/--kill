package com.beta.sched;

/**
 * 消防网关：机房气体灭火的底层下发接口。
 */
public interface FireGateway {

    void release(String zone, int delaySeconds, Broadcast broadcast);

    enum Broadcast {
        ALL,
        ROOM_ONLY
    }
}
