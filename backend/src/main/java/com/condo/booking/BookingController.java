package com.condo.booking;

import com.condo.booking.BookingDtos.Availability;
import com.condo.booking.BookingDtos.BookingDecisionRequest;
import com.condo.booking.BookingDtos.BookingDto;
import com.condo.booking.BookingDtos.BookingPolicyDto;
import com.condo.booking.BookingDtos.CalendarLink;
import com.condo.booking.BookingDtos.CreateBookingRequest;
import com.condo.booking.BookingDtos.SaveBookingPolicyRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Bookings")
public class BookingController {

    private final BookingService service;
    private final BookingCalendarService calendar;

    public BookingController(BookingService service, BookingCalendarService calendar) {
        this.service = service;
        this.calendar = calendar;
    }

    @GetMapping("/api/buildings/{buildingId}/bookable-spaces")
    public List<BookingPolicyDto> bookableSpaces(@PathVariable UUID buildingId) {
        return service.bookableSpaces(buildingId);
    }

    @GetMapping("/api/buildings/{buildingId}/spaces/{spaceId}/booking-policy")
    public BookingPolicyDto getPolicy(@PathVariable UUID buildingId, @PathVariable UUID spaceId) {
        return service.getPolicy(buildingId, spaceId);
    }

    @PutMapping("/api/buildings/{buildingId}/spaces/{spaceId}/booking-policy")
    @Operation(summary = "Make a common space bookable / change its rules")
    public BookingPolicyDto savePolicy(@PathVariable UUID buildingId, @PathVariable UUID spaceId,
            @Valid @RequestBody SaveBookingPolicyRequest req) {
        return service.savePolicy(buildingId, spaceId, req);
    }

    @GetMapping("/api/buildings/{buildingId}/spaces/{spaceId}/availability")
    @Operation(summary = "Busy slots (pending and confirmed) between two instants, at most 62 days")
    public Availability availability(@PathVariable UUID buildingId, @PathVariable UUID spaceId,
            @RequestParam Instant from, @RequestParam Instant to) {
        return service.availability(buildingId, spaceId, from, to);
    }

    @GetMapping("/api/buildings/{buildingId}/bookings")
    public List<BookingDto> list(@PathVariable UUID buildingId, @RequestParam(required = false) Boolean mine,
            @RequestParam(required = false) UUID spaceId, @RequestParam(required = false) String status,
            @RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to) {
        return service.list(buildingId, mine, spaceId, status, from, to);
    }

    @GetMapping("/api/buildings/{buildingId}/bookings/{bookingId}")
    public BookingDto get(@PathVariable UUID buildingId, @PathVariable UUID bookingId) {
        return service.get(buildingId, bookingId);
    }

    @PostMapping("/api/buildings/{buildingId}/bookings")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Request a booking; it stays PENDING (and holds the slot) until an admin decides")
    public BookingDto request(@PathVariable UUID buildingId, @Valid @RequestBody CreateBookingRequest req) {
        return service.request(buildingId, req);
    }

    @PostMapping("/api/buildings/{buildingId}/bookings/{bookingId}/approve")
    public BookingDto approve(@PathVariable UUID buildingId, @PathVariable UUID bookingId,
            @Valid @RequestBody(required = false) BookingDecisionRequest req) {
        return service.approve(buildingId, bookingId, orEmpty(req));
    }

    @PostMapping("/api/buildings/{buildingId}/bookings/{bookingId}/reject")
    public BookingDto reject(@PathVariable UUID buildingId, @PathVariable UUID bookingId,
            @Valid @RequestBody(required = false) BookingDecisionRequest req) {
        return service.reject(buildingId, bookingId, orEmpty(req));
    }

    @PostMapping("/api/buildings/{buildingId}/bookings/{bookingId}/cancel")
    public BookingDto cancel(@PathVariable UUID buildingId, @PathVariable UUID bookingId,
            @Valid @RequestBody(required = false) BookingDecisionRequest req) {
        return service.cancel(buildingId, bookingId, orEmpty(req));
    }

    @GetMapping("/api/me/bookings/calendar-link")
    @Operation(summary = "Signed iCalendar link of my confirmed bookings, for calendar apps")
    public CalendarLink calendarLink() {
        return calendar.link();
    }

    @PostMapping("/api/me/bookings/calendar-link/reset")
    @Operation(summary = "Revoke every calendar link handed out before and get a new one")
    public CalendarLink resetCalendarLink() {
        return calendar.resetLink();
    }

    @GetMapping("/api/files/calendar/{userId}.ics")
    public ResponseEntity<byte[]> calendarFeed(@PathVariable UUID userId, @RequestParam long exp,
            @RequestParam String sig) {
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "calendar", StandardCharsets.UTF_8))
                .body(calendar.feed(userId, exp, sig).getBytes(StandardCharsets.UTF_8));
    }

    private static BookingDecisionRequest orEmpty(BookingDecisionRequest req) {
        return req != null ? req : new BookingDecisionRequest(null);
    }
}
