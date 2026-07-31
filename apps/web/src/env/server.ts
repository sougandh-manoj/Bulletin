import "server-only";

import { serverEnvironmentSchema, type ServerEnvironment } from "@/env/schema";

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  const result = serverEnvironmentSchema.safeParse({
    ...process.env,
    APP_ENV: process.env.APP_ENV ?? process.env.NODE_ENV,
  });

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid server environment configuration: ${fields}`);
  }

  cachedEnvironment = result.data;
  return cachedEnvironment;
}

export type SecureAccessEnvironment = ServerEnvironment & {
  APP_BASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SESSION_SIGNING_SECRET: string;
};

export type TrustedDatabaseEnvironment = ServerEnvironment & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export type SupabaseAuthEnvironment = ServerEnvironment & {
  APP_BASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

export type IngestionEnvironment = TrustedDatabaseEnvironment & {
  CRON_SHARED_SECRET: string;
};

export type OwnerEnvironment = SecureAccessEnvironment & {
  OWNER_EMAIL: string;
};

export type IntelligenceEnvironment = IngestionEnvironment & (
  | { INTELLIGENCE_PROVIDER: "gemini"; GEMINI_API_KEY: string }
  | { INTELLIGENCE_PROVIDER: "groq"; GROQ_API_KEY: string }
);

export type ProductionEnvironment = SecureAccessEnvironment & IngestionEnvironment & {
  APP_ENV: "production";
  APP_BASE_URL: string;
  OWNER_EMAIL: string;
  GMAIL_SMTP_USER: string;
  GMAIL_SMTP_APP_PASSWORD: string;
  INTELLIGENCE_PROVIDER: "groq";
  GROQ_API_KEY: string;
};

export function getTrustedDatabaseEnvironment(): TrustedDatabaseEnvironment {
  const environment = getServerEnvironment();
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (field) => !environment[field as keyof ServerEnvironment],
  );
  if (missing.length > 0) {
    throw new Error(`Invalid trusted-database environment configuration: ${missing.join(", ")}`);
  }
  return environment as TrustedDatabaseEnvironment;
}

export function getSupabaseAuthEnvironment(): SupabaseAuthEnvironment {
  const environment = getServerEnvironment();
  const missing = ["APP_BASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY"].filter(
    (field) => !environment[field as keyof ServerEnvironment],
  );
  if (missing.length > 0) {
    throw new Error(`Invalid Supabase Auth environment configuration: ${missing.join(", ")}`);
  }
  return environment as SupabaseAuthEnvironment;
}

export function getIngestionEnvironment(): IngestionEnvironment {
  const environment = getTrustedDatabaseEnvironment();
  if (!environment.CRON_SHARED_SECRET) {
    throw new Error("Invalid ingestion environment configuration: CRON_SHARED_SECRET");
  }
  return environment as IngestionEnvironment;
}

export function getOwnerEnvironment(): OwnerEnvironment {
  const environment = getSecureAccessEnvironment();
  if (!environment.OWNER_EMAIL) {
    throw new Error("Invalid owner environment configuration: OWNER_EMAIL");
  }
  return environment as OwnerEnvironment;
}

export function getIntelligenceEnvironment(): IntelligenceEnvironment {
  const environment = getIngestionEnvironment();
  const missing: string[] = [];
  if (environment.INTELLIGENCE_PROVIDER === "disabled") {
    missing.push("INTELLIGENCE_PROVIDER=gemini or groq");
  } else if (environment.INTELLIGENCE_PROVIDER === "gemini" && !environment.GEMINI_API_KEY) {
    missing.push("GEMINI_API_KEY");
  } else if (environment.INTELLIGENCE_PROVIDER === "groq" && !environment.GROQ_API_KEY) {
    missing.push("GROQ_API_KEY");
  }
  if (missing.length > 0) {
    throw new Error(`Invalid intelligence environment configuration: ${missing.join(", ")}`);
  }
  return environment as IntelligenceEnvironment;
}

export function getSecureAccessEnvironment(): SecureAccessEnvironment {
  const environment = getServerEnvironment();
  const required = [
    "APP_BASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SESSION_SIGNING_SECRET",
  ] as const;
  const missing: string[] = required.filter((field) => !environment[field]);

  if (environment.APP_ENV === "production" && environment.EMAIL_TRANSPORT !== "smtp") {
    missing.push("EMAIL_TRANSPORT=smtp");
  }

  if (environment.EMAIL_TRANSPORT === "smtp") {
    if (!environment.GMAIL_SMTP_USER) missing.push("GMAIL_SMTP_USER");
    if (!environment.GMAIL_SMTP_APP_PASSWORD) {
      missing.push("GMAIL_SMTP_APP_PASSWORD");
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Invalid secure-access environment configuration: ${missing.join(", ")}`,
    );
  }

  return environment as SecureAccessEnvironment;
}

export function getProductionEnvironment(): ProductionEnvironment {
  const environment = getSecureAccessEnvironment();
  const missing: string[] = [];
  if (environment.APP_ENV !== "production") missing.push("APP_ENV=production");
  if (!environment.APP_BASE_URL?.startsWith("https://")) missing.push("APP_BASE_URL=https://...");
  if (!environment.CRON_SHARED_SECRET) missing.push("CRON_SHARED_SECRET");
  if (!environment.OWNER_EMAIL) missing.push("OWNER_EMAIL");
  if (!environment.GMAIL_SMTP_USER) missing.push("GMAIL_SMTP_USER");
  if (!environment.GMAIL_SMTP_APP_PASSWORD) missing.push("GMAIL_SMTP_APP_PASSWORD");
  if (environment.INTELLIGENCE_PROVIDER !== "groq") missing.push("INTELLIGENCE_PROVIDER=groq");
  if (!environment.GROQ_API_KEY) missing.push("GROQ_API_KEY");
  const independentSecrets = [
    environment.SESSION_SIGNING_SECRET,
    environment.CRON_SHARED_SECRET,
  ].filter((value): value is string => Boolean(value));
  if (new Set(independentSecrets).size !== independentSecrets.length) {
    missing.push("independent production secrets");
  }
  const leakedPublicName = Object.keys(process.env).find((name) =>
    name.startsWith("NEXT_PUBLIC_") && /(SECRET|KEY|PASSWORD|TOKEN|SERVICE_ROLE)/.test(name),
  );
  if (leakedPublicName) missing.push("no sensitive NEXT_PUBLIC_* variables");
  if (missing.length > 0) {
    throw new Error(`Invalid production environment configuration: ${missing.join(", ")}`);
  }
  return environment as ProductionEnvironment;
}
