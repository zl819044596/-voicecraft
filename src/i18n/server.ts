import { cookies } from "next/headers";
import { isLocale, type Locale, LOCALE_COOKIE, translate } from "./core";

export async function getRequestLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(v)) return v;
  return "zh";
}

export async function serverT(
  path: string,
  vars?: Record<string, string | number>,
): Promise<string> {
  const locale = await getRequestLocale();
  return translate(path, locale, vars);
}

export { translate, type Locale };
