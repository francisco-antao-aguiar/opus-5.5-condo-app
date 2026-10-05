package com.condo.common.storage;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

/** Stores files under {@code app.storage.local-dir}. Fine for dev and single-node setups. */
@Service
public class LocalDiskStorageService implements StorageService {

    private final Path root;

    public LocalDiskStorageService(@Value("${app.storage.local-dir}") String rootDir) throws IOException {
        this.root = Path.of(rootDir).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    @Override
    public void put(String key, InputStream data, long size, String contentType) throws IOException {
        Path target = resolve(key);
        Files.createDirectories(target.getParent());
        Path tmp = Files.createTempFile(target.getParent(), ".upload-", ".tmp");
        try {
            Files.copy(data, tmp, StandardCopyOption.REPLACE_EXISTING);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    @Override
    public Resource get(String key) throws IOException {
        Path path = resolve(key);
        if (!Files.isRegularFile(path)) {
            throw new FileNotFoundException(key);
        }
        return new FileSystemResource(path);
    }

    @Override
    public void delete(String key) throws IOException {
        Files.deleteIfExists(resolve(key));
    }

    /** Refuses keys that would escape the storage root ("../"), even though callers build keys themselves. */
    private Path resolve(String key) {
        Path path = root.resolve(key).normalize();
        if (!path.startsWith(root) || path.equals(root)) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        return path;
    }
}
