# APK Android de 1DAW.io

Esta aplicación muestra la web publicada en
<https://diazrivasantonio06-ai.github.io/1DAW.io/>. No guarda una copia de la
web dentro de la APK: al abrir la app, carga el sitio online sin usar la caché
del navegador. Por eso, los cambios se reflejan al publicarlos en GitHub Pages;
no hace falta generar otra APK. Hace falta conexión a Internet.

## Generar la APK

1. Instala Android Studio y el Android SDK (API 35 o posterior).
2. Abre la carpeta `android-app` en Android Studio.
3. En la configuración de Gradle, selecciona **Gradle Wrapper**; el proyecto
   fija Gradle 8.13 para que sea compatible con Android Gradle Plugin 8.13.2.
4. Espera a que termine la sincronización de Gradle.
5. Selecciona **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
6. Android Studio mostrará la ubicación de la APK generada, normalmente
   `app/build/outputs/apk/debug/app-debug.apk`.

La APK de depuración sirve para instalar y probar la app. Para distribuirla,
genera una APK firmada desde **Build > Generate Signed Bundle / APK**.
