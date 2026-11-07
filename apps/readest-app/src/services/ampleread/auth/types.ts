export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface Identity {
  id: string;
  provider: 'google' | 'apple' | 'email';
  email: string | null;
  createdAt: string;
}

export interface Me {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  identities: Identity[];
}

export interface SignInResponse {
  tokens: TokenPair;
  me: Me;
}

export interface ErrorBody {
  error: string;
  message: string;
}
