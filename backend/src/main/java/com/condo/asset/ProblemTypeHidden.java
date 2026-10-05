package com.condo.asset;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.UUID;

/** "This building doesn't want built-in problem type X offered." */
@Entity
@Table(name = "problem_type_hidden")
public class ProblemTypeHidden {

    @EmbeddedId
    private Key id;

    protected ProblemTypeHidden() {
    }

    public ProblemTypeHidden(UUID buildingId, UUID problemTypeId) {
        this.id = new Key(buildingId, problemTypeId);
    }

    public Key getId() {
        return id;
    }

    @Embeddable
    public record Key(
            @Column(name = "building_id") UUID buildingId,
            @Column(name = "problem_type_id") UUID problemTypeId) implements Serializable {
    }
}
