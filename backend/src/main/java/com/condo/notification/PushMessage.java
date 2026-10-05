package com.condo.notification;

/** One push to one device. {@code link} is the app-relative route the tap should open. */
public record PushMessage(String token, String title, String body, String link) {
}
