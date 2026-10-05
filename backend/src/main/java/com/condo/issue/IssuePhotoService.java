package com.condo.issue;

import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.storage.SignedUrls;
import com.condo.common.storage.StorageService;
import com.condo.issue.IssueService.Loaded;
import com.condo.issue.dto.IssueDtos.IssuePhotoDto;
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class IssuePhotoService {

    private static final Logger log = LoggerFactory.getLogger(IssuePhotoService.class);
    private final IssueService issueService;
    private final IssuePhotoRepository photos;
    private final StorageService storage;
    private final IssueViews views;
    private final SignedUrls signedUrls;
    private final Clock clock;

    public IssuePhotoService(IssueService issueService, IssuePhotoRepository photos, StorageService storage,
            IssueViews views, SignedUrls signedUrls, Clock clock) {
        this.issueService = issueService;
        this.photos = photos;
        this.storage = storage;
        this.views = views;
        this.signedUrls = signedUrls;
        this.clock = clock;
    }

    public IssuePhotoDto upload(UUID buildingId, UUID issueId, MultipartFile file) {
        Loaded l = issueService.load(buildingId, issueId);
        if (file == null || file.isEmpty()) {
            throw ApiException.invalidField("file", "Choose a photo");
        }
        if (l.issue().isMerged()) {
            throw ApiException.conflict(ErrorCodes.ISSUE_MERGED, "This issue was merged into another one.");
        }
        if (photos.countByIssueId(issueId) >= IssueService.MAX_PHOTOS) {
            throw ApiException.conflict(ErrorCodes.PHOTO_LIMIT,
                    "An issue can have at most " + IssueService.MAX_PHOTOS + " photos.");
        }
        if (!issueService.canAddPhoto(l)) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED,
                    "Only the reporter, affected neighbours and caretakers can add photos.");
        }
        try (InputStream in = new BufferedInputStream(file.getInputStream())) {
            in.mark(ImageTypes.HEADER_BYTES);
            byte[] header = in.readNBytes(ImageTypes.HEADER_BYTES);
            in.reset();
            ImageTypes.ImageType type = ImageTypes.sniff(header).orElseThrow(() -> new ApiException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
                    "Photos must be JPEG, PNG, WebP or HEIC."));
            Instant now = clock.instant();
            UUID uploader = l.member().getUser().getId();
            IssuePhoto photo = new IssuePhoto(buildingId, issueId, type.extension(), type.contentType(),
                    file.getSize(), uploader, now);
            storage.put(photo.getStorageKey(), in, file.getSize(), type.contentType());
            deleteFileIfRolledBack(photo.getStorageKey());
            photos.save(photo);
            l.issue().touch(now);
            issueService.record(l.issue(), IssueEvent.of(l.issue(), uploader, IssueEventType.PHOTO_ADDED, null, now));
            return views.photo(photo, l.member().getUser().getDisplayName(), true);
        } catch (IOException e) {
            throw new UncheckedIOException("Storing photo failed", e);
        }
    }

    public void delete(UUID buildingId, UUID issueId, UUID photoId) {
        Loaded l = issueService.load(buildingId, issueId);
        IssuePhoto photo = photos.findByIdAndIssueId(photoId, issueId).orElseThrow(() -> ApiException.notFound("Photo"));
        boolean uploader = photo.getUploadedByUserId().equals(l.member().getUser().getId());
        if (!uploader && !issueService.canTriage(l)) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "Only who uploaded it or a caretaker can remove it.");
        }
        photos.delete(photo);
        deleteFileAfterCommit(photo.getStorageKey());
    }

    /** Public endpoint: the signature proves the caller was allowed to see the issue when the link was made. */
    @Transactional(readOnly = true)
    public ServedPhoto serve(UUID photoId, long exp, String sig) {
        if (!signedUrls.verify(photoId.toString(), exp, sig)) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "This link is invalid or has expired.");
        }
        IssuePhoto photo = photos.findById(photoId).orElseThrow(() -> ApiException.notFound("Photo"));
        try {
            return new ServedPhoto(storage.get(photo.getStorageKey()), photo.getContentType());
        } catch (IOException e) {
            throw ApiException.notFound("Photo");
        }
    }

    public record ServedPhoto(Resource resource, String contentType) {
    }

    private void deleteFileIfRolledBack(String key) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    quietDelete(key);
                }
            }
        });
    }

    private void deleteFileAfterCommit(String key) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                quietDelete(key);
            }
        });
    }

    private void quietDelete(String key) {
        try {
            storage.delete(key);
        } catch (IOException e) {
            log.warn("Could not delete stored file {}", key, e);
        }
    }
}
