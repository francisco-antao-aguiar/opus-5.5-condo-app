package com.condo.qr;

import com.condo.qr.QrService.ResolvedAsset;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "QR codes")
public class QrController {

    private final QrService qrService;

    public QrController(QrService qrService) {
        this.qrService = qrService;
    }

    @GetMapping("/api/assets/{assetId}/resolve")
    @Operation(summary = "Resolve a scanned asset code: building, asset, whether I may report, open issues")
    public ResolvedAsset resolve(@PathVariable UUID assetId) {
        return qrService.resolve(assetId);
    }
}
