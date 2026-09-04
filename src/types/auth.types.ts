export type SafeUserPreferences = {
  theme: "light" | "dark" | "system";
  timezone: string;
  defaultCurrency: string;
  monthlyIncome: number | null;
};

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  preferences: SafeUserPreferences;
};

export type AuthResult = {
  user: SafeUser;
  token: string;
};

export type JwtPayload = {
  sub: string;
};
