export function translateSupabaseAuthError(
  error: unknown,
  fallbackMessage = "Ocorreu um erro. Tente novamente."
): string {
  const msg =
    (error as any)?.message ??
    (error as any)?.error_description ??
    (error as any)?.error ??
    "";

  const code = ((error as any)?.code ?? (error as any)?.error_code ?? "") as string;

  const raw = String(msg || "").trim();
  const normalized = raw.toLowerCase();
  const normalizedCode = String(code || "").toLowerCase();

  if (normalizedCode === "email_not_confirmed" || normalized.includes("email not confirmed")) {
    return "Seu email ainda não foi confirmado. Verifique sua caixa de entrada (e spam) e clique no link de confirmação.";
  }

  if (normalizedCode === "invalid_login_credentials" || normalized.includes("invalid login credentials")) {
    return "Email ou senha inválidos.";
  }

  if (
    normalizedCode === "user_already_exists" ||
    normalized.includes("user already registered") ||
    normalized.includes("already registered")
  ) {
    return "Já existe uma conta com este email.";
  }

  if (normalized.includes("password should be at least") || normalized.includes("password length")) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }

  if (normalized.includes("signup requires a valid password")) {
    return "Informe uma senha válida (mínimo de 6 caracteres).";
  }

  if (normalizedCode === "email_address_invalid" || normalized.includes("email address is invalid") || normalized.includes("invalid email")) {
    return "Email inválido.";
  }

  if (normalized.includes("too many requests") || normalized.includes("rate limit") || normalized.includes("email rate limit exceeded")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }

  if (normalized.includes("signup is disabled")) {
    return "Cadastro desabilitado no momento.";
  }

  // Manter compatibilidade com mensagens específicas já tratadas em outros lugares
  if (normalized.includes("invalid api key") || normalized.includes("jwt")) {
    return "Chave da API inválida. Verifique as configurações do Supabase.";
  }

  if (normalized.includes("invalid url")) {
    return "URL do Supabase inválida. Verifique as configurações.";
  }

  return raw || fallbackMessage;
}

