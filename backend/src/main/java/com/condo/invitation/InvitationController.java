package com.condo.invitation;

import com.condo.invitation.dto.InvitationDtos.AcceptInvitationResponse;
import com.condo.invitation.dto.InvitationDtos.CreateInvitationRequest;
import com.condo.invitation.dto.InvitationDtos.InvitationDto;
import com.condo.invitation.dto.InvitationDtos.InvitationPreview;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "Invitations")
public class InvitationController {

    private final InvitationService invitationService;

    public InvitationController(InvitationService invitationService) {
        this.invitationService = invitationService;
    }

    @GetMapping("/buildings/{buildingId}/invitations")
    @Operation(summary = "Invitations the caller may manage (into spaces they can invite into, plus their own)")
    public List<InvitationDto> list(@PathVariable UUID buildingId) {
        return invitationService.list(buildingId);
    }

    @PostMapping("/buildings/{buildingId}/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create an invitation code/link carrying a role, an optional unit and membership end date")
    public InvitationDto create(@PathVariable UUID buildingId, @Valid @RequestBody CreateInvitationRequest req) {
        return invitationService.create(buildingId, req);
    }

    @DeleteMapping("/buildings/{buildingId}/invitations/{invitationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Revoke an invitation (memberships already created are not affected)")
    public void revoke(@PathVariable UUID buildingId, @PathVariable UUID invitationId) {
        invitationService.revoke(buildingId, invitationId);
    }

    @GetMapping("/invitations/{code}")
    @Operation(summary = "Public preview of an invitation code (rate-limited)")
    public InvitationPreview preview(@PathVariable String code, HttpServletRequest request) {
        return invitationService.preview(code, callerKey(request));
    }

    @PostMapping("/invitations/{code}/accept")
    @Operation(summary = "Join the building with this invitation")
    public AcceptInvitationResponse accept(@PathVariable String code) {
        return invitationService.accept(code);
    }

    /** Signed-in callers are limited per account, anonymous ones per IP. */
    private static String callerKey(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken token) {
            return "user:" + token.getName();
        }
        return "ip:" + request.getRemoteAddr();
    }
}
