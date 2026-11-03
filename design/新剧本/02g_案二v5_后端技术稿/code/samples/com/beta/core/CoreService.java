package com.beta.core;

import java.util.Objects;

/**
 * 核心服务的最小生命周期封装。
 */
public final class CoreService implements AutoCloseable {

    public interface Logger {
        void info(String message);
    }

    private final Logger logger;
    private final String instanceName;
    private volatile boolean started;

    public CoreService(final Logger logger, final String instanceName) {
        this.logger = Objects.requireNonNull(logger, "logger");
        this.instanceName = Objects.requireNonNull(instanceName, "instanceName");
    }

    public synchronized void start(final int workerCount) {
        if (started) {
            logger.info(instanceName + " already started");
            return;
        }
        if (workerCount <= 0) {
            logger.info(instanceName + " start skipped: workerCount=" + workerCount);
            return;
        }
        final String startMessage = instanceName + " starting with workerCount=" + workerCount;
        logger.info(startMessage);
        for (int workerIndex = 0; workerIndex < workerCount; workerIndex++) {
            logger.info(instanceName + " worker " + workerIndex + " ready");
        }
        started = true;
    }

    public boolean isStarted() {
        return started;
    }

    @Override
    public synchronized void close() {
        if (!started) {
            return;
        }
        logger.info(instanceName + " stopping");
        started = false;
    }
}
