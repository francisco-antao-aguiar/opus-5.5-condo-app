package com.condo.issue;

import com.condo.issue.dto.IssueDtos.ChangeIssueStatusRequest;
import com.condo.issue.dto.IssueDtos.CommentRequest;
import com.condo.issue.dto.IssueDtos.IssueDashboard;
import com.condo.issue.dto.IssueDtos.IssueDto;
import com.condo.issue.dto.IssueDtos.IssuePhotoDto;
import com.condo.issue.dto.IssueDtos.IssueQuery;
import com.condo.issue.dto.IssueDtos.IssueSummaryDto;
import com.condo.issue.dto.IssueDtos.MergeIssueRequest;
import com.condo.issue.dto.IssueDtos.OtherTextGroup;
import com.condo.issue.dto.IssueDtos.Page;
import com.condo.issue.dto.IssueDtos.PromoteOtherTextRequest;
import com.condo.issue.dto.IssueDtos.PromoteOtherTextResponse;
import com.condo.issue.dto.IssueDtos.ReportIssueRequest;
import com.condo.issue.dto.IssueDtos.SharingRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@Validated
@RequestMapping("/api/buildings/{buildingId}")
@Tag(name = "Issues")
public class IssueController {

    private final IssueService issueService;
    private final IssuePhotoService photoService;
    private final IssueInsightsService insightsService;

    public IssueController(IssueService issueService, IssuePhotoService photoService,
            IssueInsightsService insightsService) {
        this.issueService = issueService;
        this.photoService = photoService;
        this.insightsService = insightsService;
    }

    @PostMapping("/issues")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Report a problem; 409 DUPLICATE_ISSUE carries the open issue to \"me too\" instead")
    public IssueDto report(@PathVariable UUID buildingId, @Valid @RequestBody ReportIssueRequest req) {
        return issueService.report(buildingId, req);
    }

    @GetMapping("/issues")
    @Operation(summary = "List issues: view=shared|mine|unit|triage, status=open|all|CSV, sort=urgency|recent")
    public Page<IssueSummaryDto> list(@PathVariable UUID buildingId, @RequestParam(required = false) String view,
            @RequestParam(required = false) String status, @RequestParam(required = false) UUID spaceId,
            @RequestParam(required = false) UUID assetId, @RequestParam(required = false) String sort,
            @RequestParam(required = false) @Min(0) Integer page,
            @RequestParam(required = false) @Min(1) @Max(100) Integer size,
            @RequestParam(required = false) IssueKind kind) {
        return issueService.list(buildingId, new IssueQuery(view, status, spaceId, assetId, sort, page, size, kind));
    }

    @GetMapping("/issues/dashboard")
    @Operation(summary = "Triage dashboard: counts, issues stuck in REPORTED, hotspots")
    public IssueDashboard dashboard(@PathVariable UUID buildingId) {
        return insightsService.dashboard(buildingId);
    }

    @GetMapping("/issues/other-texts")
    @Operation(summary = "Free \"Other\" texts grouped for review")
    public List<OtherTextGroup> otherTexts(@PathVariable UUID buildingId) {
        return insightsService.otherTexts(buildingId);
    }

    @PostMapping("/issues/other-texts/promote")
    @Operation(summary = "Add an \"Other\" text to the catalog and re-file matching issues")
    public PromoteOtherTextResponse promote(@PathVariable UUID buildingId,
            @Valid @RequestBody PromoteOtherTextRequest req) {
        return insightsService.promote(buildingId, req);
    }

    @GetMapping("/issues/{issueId}")
    public IssueDto get(@PathVariable UUID buildingId, @PathVariable UUID issueId) {
        return issueService.get(buildingId, issueId);
    }

    @GetMapping("/assets/{assetId}/open-issues")
    @Operation(summary = "Open issues on an asset (show before asking what's wrong)")
    public List<IssueSummaryDto> openOnAsset(@PathVariable UUID buildingId, @PathVariable UUID assetId) {
        return issueService.openOnAsset(buildingId, assetId);
    }

    @PostMapping("/issues/{issueId}/status")
    public IssueDto changeStatus(@PathVariable UUID buildingId, @PathVariable UUID issueId,
            @Valid @RequestBody ChangeIssueStatusRequest req) {
        return issueService.changeStatus(buildingId, issueId, req);
    }

    @PostMapping("/issues/{issueId}/comments")
    public IssueDto comment(@PathVariable UUID buildingId, @PathVariable UUID issueId,
            @Valid @RequestBody CommentRequest req) {
        return issueService.comment(buildingId, issueId, req);
    }

    @PostMapping("/issues/{issueId}/me-too")
    @Operation(summary = "\"Me too\": count me as affected and subscribe me to updates")
    public IssueDto meToo(@PathVariable UUID buildingId, @PathVariable UUID issueId) {
        return issueService.meToo(buildingId, issueId);
    }

    @DeleteMapping("/issues/{issueId}/me-too")
    public IssueDto withdrawMeToo(@PathVariable UUID buildingId, @PathVariable UUID issueId) {
        return issueService.withdrawMeToo(buildingId, issueId);
    }

    @PostMapping("/issues/{issueId}/merge")
    @Operation(summary = "Close this issue into another open one; returns the surviving issue")
    public IssueDto merge(@PathVariable UUID buildingId, @PathVariable UUID issueId,
            @Valid @RequestBody MergeIssueRequest req) {
        return issueService.merge(buildingId, issueId, req);
    }

    @PutMapping("/issues/{issueId}/sharing")
    public IssueDto setSharing(@PathVariable UUID buildingId, @PathVariable UUID issueId,
            @Valid @RequestBody SharingRequest req) {
        return issueService.setSharing(buildingId, issueId, req);
    }

    @PostMapping(path = "/issues/{issueId}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public IssuePhotoDto uploadPhoto(@PathVariable UUID buildingId, @PathVariable UUID issueId,
            @RequestPart("file") MultipartFile file) {
        return photoService.upload(buildingId, issueId, file);
    }

    @DeleteMapping("/issues/{issueId}/photos/{photoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePhoto(@PathVariable UUID buildingId, @PathVariable UUID issueId, @PathVariable UUID photoId) {
        photoService.delete(buildingId, issueId, photoId);
    }
}
