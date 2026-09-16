package com.example.loop.web;

import com.example.loop.config.LoopProperties;
import java.security.interfaces.RSAPublicKey;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Builds the token decoder explicitly instead of leaning on auto-configuration.
 *
 * <p>Boot can wire a decoder from properties alone, but which validators it
 * attaches depends on which combination of {@code public-key-location},
 * {@code issuer-uri} and {@code jwk-set-uri} happens to be set. That is exactly
 * the kind of thing that fails open — a token from the wrong issuer quietly
 * accepted because the property that would have rejected it was not honoured.
 * Spelling the three validators out here makes the security posture reviewable
 * and lets the negative tests prove each one independently.
 *
 * <p>Production alternative, same code path: replace
 * {@link NimbusJwtDecoder#withPublicKey} with
 * {@code NimbusJwtDecoder.withJwkSetUri(...)} pointed at the identity
 * provider's JWKS endpoint. The validator chain below does not change.
 */
@Configuration
public class JwtDecoderConfiguration {

    /**
     * Builds the RS256 decoder and its validator chain.
     *
     * @param publicKey the verification key, converted by Spring from the PEM
     *     resource named by
     *     {@code spring.security.oauth2.resourceserver.jwt.public-key-location}
     * @param properties the issuer and audience every token must carry
     * @return a decoder that checks signature, expiry, issuer and audience
     */
    @Bean
    JwtDecoder jwtDecoder(
            @Value("${spring.security.oauth2.resourceserver.jwt.public-key-location}") RSAPublicKey publicKey,
            LoopProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(publicKey)
                .signatureAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                // exp and nbf, with the 60s clock skew AUTH.md allows.
                JwtValidators.createDefault(),
                new JwtIssuerValidator(properties.jwtIssuer()),
                audienceValidator(properties.jwtAudience())));
        return decoder;
    }

    private static OAuth2TokenValidator<Jwt> audienceValidator(String audience) {
        return new JwtClaimValidator<List<String>>(
                JwtClaimNames.AUD, claim -> claim != null && claim.contains(audience));
    }
}
