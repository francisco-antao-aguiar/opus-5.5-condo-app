package com.condo.member;

import com.condo.member.dto.MemberDtos.MeResponse;
import com.condo.member.dto.MemberDtos.MemberDto;
import com.condo.member.dto.MemberDtos.UpdateMemberRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "Members")
public class MemberController {

    private final MemberService memberService;

    public MemberController(MemberService memberService) {
        this.memberService = memberService;
    }

    @GetMapping("/me")
    @Operation(summary = "Current user and their active memberships")
    public MeResponse me() {
        return memberService.me();
    }

    @GetMapping("/buildings/{buildingId}/members")
    public List<MemberDto> list(@PathVariable UUID buildingId) {
        return memberService.list(buildingId);
    }

    @PutMapping("/buildings/{buildingId}/members/{memberId}")
    @Operation(summary = "Change role, unit and membership expiry")
    public MemberDto update(@PathVariable UUID buildingId, @PathVariable UUID memberId,
            @Valid @RequestBody UpdateMemberRequest req) {
        return memberService.update(buildingId, memberId, req);
    }

    @DeleteMapping("/buildings/{buildingId}/members/{memberId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Revoke a membership (or leave the building when it is your own)")
    public void revoke(@PathVariable UUID buildingId, @PathVariable UUID memberId) {
        memberService.revoke(buildingId, memberId);
    }
}
