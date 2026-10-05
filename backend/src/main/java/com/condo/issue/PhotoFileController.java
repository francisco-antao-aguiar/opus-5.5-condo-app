package com.condo.issue;

import com.condo.issue.IssuePhotoService.ServedPhoto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Serves photo bytes for signed links (no Authorization header, so plain {@code <img src>} works). */
@RestController
@Tag(name = "Files")
public class PhotoFileController {

    private final IssuePhotoService photoService;

    public PhotoFileController(IssuePhotoService photoService) {
        this.photoService = photoService;
    }

    @GetMapping("/api/files/photos/{photoId}")
    @Operation(summary = "Photo bytes for a signed, short-lived link")
    public ResponseEntity<Resource> photo(@PathVariable UUID photoId, @RequestParam long exp,
            @RequestParam String sig) {
        ServedPhoto served = photoService.serve(photoId, exp, sig);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(served.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(served.resource());
    }
}
