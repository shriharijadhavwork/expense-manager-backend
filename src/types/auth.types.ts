export type SafeUser = {
  id: string;
  name: string;
  email: string;
};

export type AuthResult = {
  user: SafeUser;
  token: string;
};

export type JwtPayload = {
  sub: string;
};
