const { withMainApplication } = require("@expo/config-plugins");

// Installs a Thread.UncaughtExceptionHandler as the very first statement of
// MainApplication.onCreate() (before super.onCreate() and before any Expo/RN
// native init) so that a crash happening before any UI can render — including
// the crash this was written to diagnose — still gets its stack trace written
// to a file readable via a plain file manager, with no adb/root needed.
// Writes to getExternalFilesDir(null) since that needs no runtime permission
// on any supported API level and is still visible via stock/Google Files apps
// under Android/data/<package>/files/.
const JAVA_SNIPPET = `
    final Thread.UncaughtExceptionHandler crashLoggerDefaultHandler = Thread.getDefaultUncaughtExceptionHandler();
    Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
      @Override
      public void uncaughtException(Thread thread, Throwable throwable) {
        try {
          java.io.File dir = getExternalFilesDir(null);
          if (dir != null) {
            java.io.File logFile = new java.io.File(dir, "crash-log.txt");
            java.io.FileWriter writer = new java.io.FileWriter(logFile, true);
            writer.append(new java.util.Date().toString()).append("\\n");
            java.io.StringWriter sw = new java.io.StringWriter();
            throwable.printStackTrace(new java.io.PrintWriter(sw));
            writer.append(sw.toString()).append("\\n\\n");
            writer.flush();
            writer.close();
          }
        } catch (Throwable ignored) {}
        if (crashLoggerDefaultHandler != null) {
          crashLoggerDefaultHandler.uncaughtException(thread, throwable);
        } else {
          System.exit(1);
        }
      }
    });
`;

const KOTLIN_SNIPPET = `
    val crashLoggerDefaultHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val dir = getExternalFilesDir(null)
        if (dir != null) {
          val logFile = java.io.File(dir, "crash-log.txt")
          val writer = java.io.FileWriter(logFile, true)
          writer.append(java.util.Date().toString()).append("\\n")
          val sw = java.io.StringWriter()
          throwable.printStackTrace(java.io.PrintWriter(sw))
          writer.append(sw.toString()).append("\\n\\n")
          writer.flush()
          writer.close()
        }
      } catch (ignored: Throwable) {}
      if (crashLoggerDefaultHandler != null) {
        crashLoggerDefaultHandler.uncaughtException(thread, throwable)
      } else {
        System.exit(1)
      }
    }
`;

module.exports = function withCrashLogger(config) {
  return withMainApplication(config, (config) => {
    const isKotlin = config.modResults.language === "kt";
    const snippet = isKotlin ? KOTLIN_SNIPPET : JAVA_SNIPPET;
    const onCreateRegex = isKotlin
      ? /override fun onCreate\(\) \{\n/
      : /public void onCreate\(\) \{\n/;

    if (!onCreateRegex.test(config.modResults.contents)) {
      throw new Error(
        "withCrashLogger: could not find onCreate() in MainApplication to inject the crash logger into"
      );
    }

    config.modResults.contents = config.modResults.contents.replace(
      onCreateRegex,
      (match) => match + snippet
    );

    return config;
  });
};
