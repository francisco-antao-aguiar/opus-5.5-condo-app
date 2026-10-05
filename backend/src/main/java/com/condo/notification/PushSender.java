package com.condo.notification;

import java.util.List;
import java.util.Set;

/** Delivers pushes; returns tokens the provider says are dead (uninstalled app), so they can be forgotten. */
public interface PushSender {

    Set<String> send(List<PushMessage> messages);
}
