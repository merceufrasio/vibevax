import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/i18n/en.json";
import vi from "@/i18n/vi.json";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    compatibilityJSON: "v4",
    lng: "vi",
    fallbackLng: "vi",
    resources: {
      vi: { translation: vi },
      en: { translation: en },
    },
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;

