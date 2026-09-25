#!/usr/bin/env bash
# Ajuste le projet Android généré par Capacitor.
set -euo pipefail
MAN=android/app/src/main/AndroidManifest.xml
RES=android/app/src/main/res

# Alarmes exactes accordées d'office (appli agenda) + notifications
grep -q USE_EXACT_ALARM "$MAN" || sed -i 's#</manifest>#    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />\n</manifest>#' "$MAN"

# Petite icône de notification (horloge, monochrome)
mkdir -p "$RES/drawable"
cat > "$RES/drawable/ic_stat_agenda.xml" <<'XML'
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF"
      android:pathData="M12,2A10,10 0,1 0,22 12,10 10,0 0,0 12,2ZM12,20A8,8 0,1 1,20 12,8 8,0 0,1 12,20ZM12.75,7H11.25V12.6L15.6,15.2 16.35,13.95 12.75,11.8Z"/>
</vector>
XML

# Icône de l'appli
npx --yes @capacitor/assets@3 generate --android \
  --iconBackgroundColor '#0F1115' --iconBackgroundColorDark '#0F1115' \
  --splashBackgroundColor '#0F1115' --splashBackgroundColorDark '#0F1115' || echo "icônes : on garde celles par défaut"

# Numéro de version = numéro de build (mises à jour sans désinstaller)
if [ -n "${GITHUB_RUN_NUMBER:-}" ]; then
  sed -i -E "s/versionCode [0-9]+/versionCode ${GITHUB_RUN_NUMBER}/; s/versionName \"[^\"]+\"/versionName \"1.0.${GITHUB_RUN_NUMBER}\"/" android/app/build.gradle
fi
