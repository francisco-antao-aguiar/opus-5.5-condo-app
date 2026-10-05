package com.condo.common.storage;

import java.io.IOException;
import java.io.InputStream;
import org.springframework.core.io.Resource;

/**
 * Binary storage for uploads (issue photos). Keys are opaque, slash-separated paths chosen by the caller.
 * The dev implementation writes to local disk; an S3 implementation would map keys to object names.
 */
public interface StorageService {

    void put(String key, InputStream data, long size, String contentType) throws IOException;

    /** @throws java.io.FileNotFoundException when the key doesn't exist */
    Resource get(String key) throws IOException;

    /** No-op when the key doesn't exist. */
    void delete(String key) throws IOException;
}
