package com.example.loop.support;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyPair;
import java.security.interfaces.RSAPrivateKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;

/**
 * Mints the RS256 tokens the auth tests present, one factory method per case.
 *
 * <p>Key material lives in {@link EphemeralRsaKeys}; this class only decides what claims
 * go into a token and which key signs it.
 */
public final class JwtTestTokens {

    /** Issuer fixed for the whole stack by the authentication design. */
    public static final String ISSUER = "https://auth.fullstack-loop.local/";

    /** Audience fixed for this API by the authentication design. */
    public static final String AUDIENCE = "fullstack-loop-api";

    /** Scope required to read tasks. */
    public static final String SCOPE_READ = "tasks:read";

    /** Scope required to create tasks. */
    public static final String SCOPE_WRITE = "tasks:write";

    /** Both scopes, space-delimited, as a token from a full client would carry. */
    public static final String SCOPE_BOTH = SCOPE_READ + " " + SCOPE_WRITE;

    private static final Duration TOKEN_LIFETIME = Duration.ofMinutes(10);
    private static final Duration LONG_EXPIRED = Duration.ofHours(2);

    private JwtTestTokens() {}

    /**
     * Mints a token that should be accepted.
     *
     * @param scope the space-delimited scope claim to embed
     * @return a serialized, signed, currently valid token
     */
    public static String valid(String scope) {
        return sign(EphemeralRsaKeys.TRUSTED, defaults(scope).build());
    }

    /**
     * Mints a token that is correct in every way except that it has expired.
     *
     * @return a serialized token whose {@code exp} is well in the past
     */
    public static String expired() {
        Instant longAgo = Instant.now().minus(LONG_EXPIRED);
        return sign(
                EphemeralRsaKeys.TRUSTED,
                defaults(SCOPE_BOTH)
                        .issueTime(Date.from(longAgo))
                        .expirationTime(Date.from(longAgo.plus(Duration.ofMinutes(1))))
                        .build());
    }

    /**
     * Mints a token that is correct in every way except the {@code iss} claim.
     *
     * @return a serialized token from an untrusted issuer
     */
    public static String wrongIssuer() {
        return sign(
                EphemeralRsaKeys.TRUSTED,
                defaults(SCOPE_BOTH).issuer("https://evil.example.com/").build());
    }

    /**
     * Mints a token that is correct in every way except the {@code aud} claim.
     *
     * @return a serialized token addressed to a different API
     */
    public static String wrongAudience() {
        return sign(
                EphemeralRsaKeys.TRUSTED,
                defaults(SCOPE_BOTH).audience(List.of("some-other-api")).build());
    }

    /**
     * Mints a token that carries no {@code aud} claim at all.
     *
     * @return a serialized token with the audience claim omitted
     */
    public static String noAudience() {
        // Built from the claims that precede the audience rather than by setting
        // it to null: an omitted claim is what a real misissued token looks like.
        return sign(EphemeralRsaKeys.TRUSTED, claimsWithoutAudience(SCOPE_BOTH).build());
    }

    /**
     * Mints a well-formed, current token signed with an untrusted key.
     *
     * @return a serialized token whose signature will not verify
     */
    public static String badSignature() {
        return sign(EphemeralRsaKeys.UNTRUSTED, defaults(SCOPE_BOTH).build());
    }

    private static JWTClaimsSet.Builder defaults(String scope) {
        return claimsWithoutAudience(scope).audience(List.of(AUDIENCE));
    }

    private static JWTClaimsSet.Builder claimsWithoutAudience(String scope) {
        Instant now = Instant.now();
        return new JWTClaimsSet.Builder()
                .subject("loop-dev-user")
                .issuer(ISSUER)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(TOKEN_LIFETIME)))
                .claim("scope", scope);
    }

    private static String sign(KeyPair keyPair, JWTClaimsSet claims) {
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims);
        try {
            jwt.sign(new RSASSASigner((RSAPrivateKey) keyPair.getPrivate()));
        } catch (JOSEException e) {
            throw new IllegalStateException("could not sign test token", e);
        }
        return jwt.serialize();
    }
}
