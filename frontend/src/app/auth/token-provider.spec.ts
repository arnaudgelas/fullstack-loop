import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { StaticTokenProvider, TokenProvider, provideToken } from './token-provider';

describe('TokenProvider', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('returns the token it was built with', () => {
    expect(new StaticTokenProvider('a.b.c').token()).toBe('a.b.c');
  });

  it('returns null when there is no token', () => {
    expect(new StaticTokenProvider(null).token()).toBeNull();
  });

  it('is injectable through the abstract seam, so tests can substitute one', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideToken('injected.jwt.value')] });

    expect(TestBed.inject(TokenProvider).token()).toBe('injected.jwt.value');
  });
});
