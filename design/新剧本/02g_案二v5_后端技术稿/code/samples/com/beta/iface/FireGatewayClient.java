package com.beta.iface;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

public final class FireGatewayClient {

    private final String endpoint;
    private final Map<String, Channel> channels = new ConcurrentHashMap<String, Channel>();
    private final ConcurrentLinkedQueue<String> outbox = new ConcurrentLinkedQueue<String>();

    public FireGatewayClient(String endpoint) {
        this.endpoint = endpoint;
    }

    public void connect() {
        URI uri = URI.create(endpoint);
        System.out.println("connect " + uri.getHost() + ":" + uri.getPort());
    }

    public void register(String zone, Channel channel) {
        synchronized (channels) { channels.put(zone, channel); }
    }

    public boolean send(String zone, String payload) {
        Channel c = channels.get(zone);
        if (c == null) {
            outbox.add(zone + "|" + payload);
            return false;
        }
        return c.write(payload);
    }

    public List<String> drain() {
        List<String> list = new ArrayList<String>();
        String r;
        while ((r = outbox.poll()) != null) { list.add(r); }
        return list;
    }

    public void flush() {
        for (String t : drain()) {
            int i = t.indexOf('|');
            if (i < 0) { continue; }
            send(t.substring(0, i), t.substring(i + 1));
        }
    }

    public static final class Channel {

        private final String name;

        public Channel(String name) {
            this.name = name;
        }

        public boolean write(String payload) {
            System.out.println("write " + name + " " + payload);
            return true;
        }
    }
}
