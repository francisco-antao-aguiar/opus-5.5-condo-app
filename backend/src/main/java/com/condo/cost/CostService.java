package com.condo.cost;

import com.condo.asset.Asset;
import com.condo.asset.AssetRepository;
import com.condo.auth.User;
import com.condo.auth.UserRepository;
import com.condo.building.BuildingRepository;
import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import com.condo.common.persistence.Versions;
import com.condo.common.storage.SignedUrls;
import com.condo.common.storage.StorageService;
import com.condo.cost.CostDtos.CostEntryDto;
import com.condo.cost.CostDtos.CostQuery;
import com.condo.cost.CostDtos.CostReceiptDto;
import com.condo.cost.CostDtos.CostSummary;
import com.condo.cost.CostDtos.CostSummaryRow;
import com.condo.cost.CostDtos.GroupBy;
import com.condo.cost.CostDtos.MoneyDto;
import com.condo.cost.CostDtos.SaveCostEntryRequest;
import com.condo.governance.AccessGuard;
import com.condo.governance.Action;
import com.condo.governance.SpacePrivacy;
import com.condo.issue.ImageTypes;
import com.condo.issue.Issue;
import com.condo.issue.IssueAccess;
import com.condo.issue.IssueRepository;
import com.condo.issue.IssueViews;
import com.condo.issue.dto.IssueDtos.Page;
import com.condo.maintenance.MaintenancePlan;
import com.condo.maintenance.MaintenancePlanRepository;
import com.condo.member.Membership;
import com.condo.space.Space;
import com.condo.space.SpaceRepository;
import com.condo.space.SpaceService;
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** Cost tracking: entries with receipts, privacy inherited from what they're anchored to, per-currency reports. */
@Service
@Transactional
public class CostService {

    private static final Logger log = LoggerFactory.getLogger(CostService.class);
    private static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);
    private static final DateTimeFormatter MONTH_LABEL = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH);

    private final CostEntryRepository costs;
    private final IssueRepository issues;
    private final MaintenancePlanRepository plans;
    private final AssetRepository assets;
    private final SpaceRepository spaces;
    private final BuildingRepository buildings;
    private final UserRepository users;
    private final AccessGuard guard;
    private final SpacePrivacy privacy;
    private final IssueAccess issueAccess;
    private final StorageService storage;
    private final SignedUrls signedUrls;
    private final Clock clock;

    public CostService(CostEntryRepository costs, IssueRepository issues, MaintenancePlanRepository plans,
            AssetRepository assets, SpaceRepository spaces, BuildingRepository buildings, UserRepository users,
            AccessGuard guard, SpacePrivacy privacy, IssueAccess issueAccess, StorageService storage,
            SignedUrls signedUrls, Clock clock) {
        this.costs = costs;
        this.issues = issues;
        this.plans = plans;
        this.assets = assets;
        this.spaces = spaces;
        this.buildings = buildings;
        this.users = users;
        this.guard = guard;
        this.privacy = privacy;
        this.issueAccess = issueAccess;
        this.storage = storage;
        this.signedUrls = signedUrls;
        this.clock = clock;
    }

    // ===================== reading =====================

    @Transactional(readOnly = true)
    public Page<CostEntryDto> list(UUID buildingId, CostQuery q) {
        Membership member = guard.require(buildingId, Action.COST_VIEW);
        Context ctx = context(buildingId);
        List<CostEntry> visible = visible(member, buildingId, q, ctx);
        int size = q.size() != null ? q.size() : 25;
        int page = q.page() != null ? q.page() : 0;
        List<CostEntryDto> items = visible.stream().skip((long) page * size).limit(size)
                .map(c -> toDto(c, ctx)).toList();
        return new Page<>(items, page, size, visible.size());
    }

    @Transactional(readOnly = true)
    public CostEntryDto get(UUID buildingId, UUID costId) {
        Membership member = guard.require(buildingId, Action.COST_VIEW);
        Context ctx = context(buildingId);
        CostEntry entry = find(buildingId, costId);
        if (!canSee(member, entry, ctx)) {
            throw ApiException.notFound("Cost");
        }
        return toDto(entry, ctx);
    }

    /** Totals per group and per currency — never summed across currencies. */
    @Transactional(readOnly = true)
    public CostSummary summary(UUID buildingId, GroupBy groupBy, CostQuery q) {
        Membership member = guard.require(buildingId, Action.COST_VIEW);
        Context ctx = context(buildingId);
        List<CostEntry> visible = visible(member, buildingId, q, ctx);

        Map<String, List<CostEntry>> groups = new LinkedHashMap<>();
        Map<String, String> labels = new HashMap<>();
        for (CostEntry c : visible) {
            String key;
            String label;
            switch (groupBy) {
                case MONTH -> {
                    YearMonth ym = YearMonth.from(c.getIncurredOn());
                    key = ym.toString();
                    label = ym.format(MONTH_LABEL);
                }
                case CATEGORY -> {
                    key = c.getCategory().name();
                    label = key.charAt(0) + key.substring(1).toLowerCase(Locale.ROOT);
                }
                case ASSET -> {
                    Asset a = c.getAssetId() != null ? ctx.assets().get(c.getAssetId()) : null;
                    key = a != null ? a.getId().toString() : "none";
                    label = a != null ? a.getName() : "No item";
                }
                default -> {
                    Space s = c.getSpaceId() != null ? ctx.spaces().get(c.getSpaceId()) : null;
                    key = s != null ? s.getId().toString() : "none";
                    label = s != null ? SpaceService.pathLabel(s, ctx.spaces()) : "No place";
                }
            }
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(c);
            labels.put(key, label);
        }
        List<CostSummaryRow> rows = groups.entrySet().stream()
                .map(e -> new CostSummaryRow(e.getKey(), labels.get(e.getKey()), totals(e.getValue()),
                        e.getValue().size()))
                .sorted(groupBy == GroupBy.MONTH ? Comparator.comparing(CostSummaryRow::key)
                        : Comparator.comparingInt(CostSummaryRow::count).reversed()
                                .thenComparing(CostSummaryRow::label))
                .toList();
        return new CostSummary(groupBy.name().toLowerCase(Locale.ROOT), rows, totals(visible));
    }

    /** CSV for the accountant (UTF-8 with BOM so spreadsheet apps keep accents). */
    @Transactional(readOnly = true)
    public String exportCsv(UUID buildingId, LocalDate from, LocalDate to) {
        Membership member = guard.require(buildingId, Action.COST_VIEW);
        Context ctx = context(buildingId);
        List<CostEntry> visible = visible(member, buildingId,
                new CostQuery(from, to, null, null, null, null, null, null), ctx);
        StringBuilder csv = new StringBuilder("﻿");
        csv.append("date,amount,currency,category,description,vendor,issue,item,location,maintenance_plan,entered_by\n");
        for (CostEntry c : visible.stream().sorted(Comparator.comparing(CostEntry::getIncurredOn)).toList()) {
            CostEntryDto d = toDto(c, ctx);
            csv.append(String.join(",", Arrays.asList(
                    d.incurredOn().toString(), d.amount().amount(), d.amount().currency(), d.category().name(),
                    cell(d.description()), cell(d.vendor()), d.issueNumber() != null ? "#" + d.issueNumber() : "",
                    cell(d.assetName()), cell(d.locationLabel()), cell(d.planTitle()), cell(d.createdByName()))))
                    .append('\n');
        }
        return csv.toString();
    }

    // ===================== writing =====================

    public CostEntryDto create(UUID buildingId, SaveCostEntryRequest req) {
        Membership member = guard.require(buildingId, Action.COST_MANAGE);
        CostEntry entry = new CostEntry(buildingId, member.getUser().getId());
        apply(member, buildingId, entry, req);
        costs.save(entry);
        return toDto(entry, context(buildingId));
    }

    public CostEntryDto update(UUID buildingId, UUID costId, SaveCostEntryRequest req) {
        Membership member = guard.require(buildingId, Action.COST_MANAGE);
        CostEntry entry = find(buildingId, costId);
        Versions.requireCurrent(req.version(), entry);
        apply(member, buildingId, entry, req);
        costs.flush();
        return toDto(entry, context(buildingId));
    }

    public void delete(UUID buildingId, UUID costId, String reason) {
        guard.require(buildingId, Action.COST_MANAGE);
        String why = reason == null ? "" : reason.trim();
        if (why.length() < 3 || why.length() > 300) {
            throw ApiException.invalidField("reason", "Say briefly why this cost is removed");
        }
        find(buildingId, costId).delete(why, clock.instant());
    }

    /** Image or PDF, by magic bytes; replaces any previous receipt. */
    public CostEntryDto uploadReceipt(UUID buildingId, UUID costId, MultipartFile file) {
        guard.require(buildingId, Action.COST_MANAGE);
        CostEntry entry = find(buildingId, costId);
        if (file == null || file.isEmpty()) {
            throw ApiException.invalidField("file", "Choose a photo or PDF of the receipt");
        }
        try (InputStream in = new BufferedInputStream(file.getInputStream())) {
            in.mark(ImageTypes.HEADER_BYTES);
            byte[] header = in.readNBytes(ImageTypes.HEADER_BYTES);
            in.reset();
            ImageTypes.ImageType type = receiptType(header).orElseThrow(() -> new ApiException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
                    "Receipts must be a photo (JPEG, PNG, WebP, HEIC) or a PDF."));
            String key = "costs/" + buildingId + "/" + costId + "/receipt-" + UUID.randomUUID() + "."
                    + type.extension();
            storage.put(key, in, file.getSize(), type.contentType());
            String previous = entry.getReceiptStorageKey();
            afterCompletion(key, previous);
            entry.attachReceipt(key, type.contentType());
            costs.flush();
            return toDto(entry, context(buildingId));
        } catch (IOException e) {
            throw new UncheckedIOException("Storing receipt failed", e);
        }
    }

    /** Public, signed link (like issue photos). */
    @Transactional(readOnly = true)
    public ServedReceipt serveReceipt(UUID costId, long exp, String sig) {
        if (!signedUrls.verify("receipt:" + costId, exp, sig)) {
            throw ApiException.forbidden(ErrorCodes.PERMISSION_DENIED, "This link is invalid or has expired.");
        }
        CostEntry entry = costs.findById(costId).filter(c -> c.getReceiptStorageKey() != null)
                .orElseThrow(() -> ApiException.notFound("Receipt"));
        try {
            return new ServedReceipt(storage.get(entry.getReceiptStorageKey()), entry.getReceiptContentType());
        } catch (IOException e) {
            throw ApiException.notFound("Receipt");
        }
    }

    public record ServedReceipt(Resource resource, String contentType) {
    }

    // ===================== helpers =====================

    /** Validates anchors (each must exist in this building and be visible to the author) and derives the rest. */
    private void apply(Membership member, UUID buildingId, CostEntry entry, SaveCostEntryRequest req) {
        String currency = req.amount().currency() != null ? req.amount().currency()
                : buildings.findById(buildingId).orElseThrow().getCurrency();
        Money money = Money.parse(req.amount().amount(), currency);
        Context ctx = context(buildingId);
        UUID assetId = req.assetId();
        UUID spaceId = req.spaceId();
        if (req.issueId() != null) {
            Issue issue = Optional.ofNullable(ctx.issue(req.issueId()))
                    .filter(i -> issueAccess.canSee(member, i, ctx.spaces().get(i.getSpaceId())))
                    .orElseThrow(() -> ApiException.notFound("Issue"));
            assetId = assetId != null ? assetId : issue.getAssetId();
            spaceId = spaceId != null ? spaceId : issue.getSpaceId();
        }
        if (req.maintenancePlanId() != null) {
            MaintenancePlan plan = plans.findByIdAndBuildingId(req.maintenancePlanId(), buildingId)
                    .orElseThrow(() -> ApiException.notFound("Maintenance plan"));
            assetId = assetId != null ? assetId : plan.getAssetId();
            spaceId = spaceId != null ? spaceId : plan.getSpaceId();
        }
        if (assetId != null) {
            Asset asset = Optional.ofNullable(ctx.assets().get(assetId))
                    .orElseThrow(() -> ApiException.notFound("Asset"));
            spaceId = spaceId != null ? spaceId : asset.getSpaceId();
        }
        if (spaceId != null && !ctx.spaces().containsKey(spaceId)) {
            throw ApiException.notFound("Space");
        }
        entry.define(money, req.incurredOn(), req.category(), req.description().trim(), blankToNull(req.vendor()),
                req.issueId(), req.maintenancePlanId(), assetId, spaceId);
    }

    private List<CostEntry> visible(Membership member, UUID buildingId, CostQuery q, Context ctx) {
        return costs.findLive(buildingId, q.from() != null ? q.from() : MIN_DATE, q.to() != null ? q.to() : MAX_DATE)
                .stream()
                .filter(c -> q.category() == null || q.category() == c.getCategory())
                .filter(c -> q.assetId() == null || q.assetId().equals(c.getAssetId()))
                .filter(c -> q.issueId() == null || q.issueId().equals(c.getIssueId()))
                .filter(c -> q.maintenancePlanId() == null || q.maintenancePlanId().equals(c.getMaintenancePlanId()))
                .filter(c -> canSee(member, c, ctx))
                .toList();
    }

    /** A cost is as private as what it's about: its issue, else its space (or its asset's space). */
    private boolean canSee(Membership member, CostEntry c, Context ctx) {
        if (c.getIssueId() != null) {
            Issue issue = ctx.issue(c.getIssueId());
            if (issue != null) {
                return issueAccess.canSee(member, issue, ctx.spaces().get(issue.getSpaceId()));
            }
        }
        UUID spaceId = c.getSpaceId();
        if (spaceId == null && c.getAssetId() != null && ctx.assets().containsKey(c.getAssetId())) {
            spaceId = ctx.assets().get(c.getAssetId()).getSpaceId();
        }
        Space space = spaceId != null ? ctx.spaces().get(spaceId) : null;
        return space == null || privacy.canSee(member, space, SpaceService.effectiveVisibility(space, ctx.spaces()));
    }

    private static List<MoneyDto> totals(List<CostEntry> entries) {
        Map<String, Money> byCurrency = new TreeMap<>();
        for (CostEntry c : entries) {
            Money m = c.money();
            byCurrency.merge(m.code(), m, Money::plus);
        }
        return byCurrency.values().stream().map(MoneyDto::of).toList();
    }

    private CostEntryDto toDto(CostEntry c, Context ctx) {
        Issue issue = c.getIssueId() != null ? ctx.issue(c.getIssueId()) : null;
        MaintenancePlan plan = c.getMaintenancePlanId() != null
                ? plans.findById(c.getMaintenancePlanId()).orElse(null) : null;
        Asset asset = c.getAssetId() != null ? ctx.assets().get(c.getAssetId()) : null;
        Space space = c.getSpaceId() != null ? ctx.spaces().get(c.getSpaceId()) : null;
        CostReceiptDto receipt = null;
        if (c.getReceiptStorageKey() != null) {
            SignedUrls.Signature sig = signedUrls.sign("receipt:" + c.getId());
            String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path("/api/files/receipts/{id}").queryParam("exp", sig.expiresAtEpochSeconds())
                    .queryParam("sig", sig.sig()).buildAndExpand(c.getId()).toUriString();
            receipt = new CostReceiptDto(url, sig.expiresAt(), c.getReceiptContentType());
        }
        String author = users.findById(c.getCreatedByUserId()).map(User::getDisplayName).orElse("Former member");
        return new CostEntryDto(c.getId(), c.getBuildingId(), MoneyDto.of(c.money()), c.getIncurredOn(),
                c.getCategory(), c.getDescription(), c.getVendor(), c.getIssueId(),
                issue != null ? issue.getNumber() : null, c.getMaintenancePlanId(),
                plan != null ? plan.getTitle() : null, c.getAssetId(), asset != null ? asset.getName() : null,
                c.getSpaceId(), space != null ? SpaceService.pathLabel(space, ctx.spaces()) : null, receipt, author,
                c.getCreatedAt(), c.getVersion() != null ? c.getVersion() : 0L);
    }

    private static Optional<ImageTypes.ImageType> receiptType(byte[] header) {
        if (header.length >= 5 && new String(header, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) {
            return Optional.of(new ImageTypes.ImageType("application/pdf", "pdf"));
        }
        return ImageTypes.sniff(header);
    }

    /** New file is removed if the transaction fails; the replaced one only once the change is committed. */
    private void afterCompletion(String newKey, String previousKey) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                String obsolete = status == STATUS_COMMITTED ? previousKey : newKey;
                if (obsolete != null) {
                    try {
                        storage.delete(obsolete);
                    } catch (IOException e) {
                        log.warn("Could not delete stored file {}", obsolete, e);
                    }
                }
            }
        });
    }

    private CostEntry find(UUID buildingId, UUID costId) {
        return costs.findByIdAndBuildingIdAndDeletedAtIsNull(costId, buildingId)
                .orElseThrow(() -> ApiException.notFound("Cost"));
    }

    private Context context(UUID buildingId) {
        return new Context(
                IssueViews.index(spaces.findByBuildingIdOrderByDepthAscSortOrderAscNameAsc(buildingId)),
                assets.findByBuildingId(buildingId).stream().collect(Collectors.toMap(Asset::getId, Function.identity())),
                new HashMap<>(), issues);
    }

    /** Spaces and assets loaded once per request; issues loaded on demand and cached. */
    private record Context(Map<UUID, Space> spaces, Map<UUID, Asset> assets, Map<UUID, Optional<Issue>> issueCache,
            IssueRepository issueRepository) {

        Issue issue(UUID id) {
            return issueCache.computeIfAbsent(id, issueRepository::findById).orElse(null);
        }
    }

    /** Quotes a CSV cell when needed; neutralizes leading =,+,-,@ so spreadsheets don't run formulas. */
    static String cell(String value) {
        if (value == null) {
            return "";
        }
        String v = value;
        if (!v.isEmpty() && "=+-@".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            v = "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
