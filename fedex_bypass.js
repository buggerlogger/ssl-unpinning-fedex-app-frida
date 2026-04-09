console.log("==========================================");
console.log("   FedEx Custom Root & Emulator Bypass");
console.log("==========================================");

Java.perform(() => {
    console.log("[*] Injecting ForgeRock & Dynatrace Hooks...");

    try {
        const forgeRockRoot = Java.use("org.forgerock.android.auth.detector.e");
        forgeRockRoot.isRooted.overload('android.content.Context').implementation = function (ctx) {
            console.log("[+] Bypassed ForgeRock isRooted() -> 0.0");
            return 0.0;
        };
    } catch (e) {
        console.log("[-] ForgeRock 'e' class not found");
    }

    try {
        const forgeRockNative = Java.use("org.forgerock.android.auth.detector.NativeDetector");
        forgeRockNative.isRooted.overload('android.content.Context').implementation = function (ctx) {
            console.log("[+] Bypassed ForgeRock NativeDetector isRooted() -> 0.0");
            return 0.0;
        };
        forgeRockNative.exists.overload('[Ljava.lang.Object;').implementation = function (objArr) {
            console.log("[+] Bypassed ForgeRock NativeDetector JNI exists() -> 0");
            return 0;
        };
    } catch (e) { }

    try {
        const forgeRockP = Java.use("org.forgerock.android.auth.detector.p");
        forgeRockP.isRooted.overload('android.content.Context').implementation = function (ctx) {
            return 0.0;
        };
    } catch (e) { }


    try {
        const dynaTraceRoot = Java.use("com.dynatrace.agent.util.RootDetector");

        dynaTraceRoot.isDeviceRooted.overload('android.content.Context').implementation = function (ctx) {
            console.log("[+] Bypassed Dynatrace isDeviceRooted() -> false");
            return false;
        };

        dynaTraceRoot.isDeviceRootedInternal.overload('android.content.Context').implementation = function (ctx) {
            console.log("[+] Bypassed Dynatrace isDeviceRootedInternal() -> false");
            return false;
        };

        dynaTraceRoot.checkPotentialRootApps$com_dynatrace_agent_release.overload('android.content.Context').implementation = function (ctx) {
            return false;
        };

        dynaTraceRoot.checkTestKeys$com_dynatrace_agent_release.implementation = function () {
            return false;
        };

    } catch (e) {
        console.log("[-] Dynatrace RootDetector not found");
    }

    try {
        const FileClass = Java.use("java.io.File");
        const rootPaths = [
            "/system/app/superuser.apk", "/sbin/su", "/system/bin/su", "/system/xbin/su",
            "/data/local/xbin/su", "/data/local/bin/su", "/system/sd/xbin/su",
            "/system/bin/failsafe/su", "/data/local/su", "/su/bin/su",
            "/system/app/magisk.apk", "/data/adb/magisk", "/data/local/tmp/frida",
            "/data/local/tmp/frida-server", "/data/local/tmp/frida-gadget.so"
        ];

        FileClass.exists.implementation = function () {
            const path = this.getAbsolutePath().toLowerCase();
            for (let i = 0; i < rootPaths.length; i++) {
                if (path == rootPaths[i] || path.endsWith("/su") || path.endsWith("/magisk")) {
                    console.log("[+] Blocked Java File check for: " + path);
                    return false;
                }
            }
            return this.exists();
        };
    } catch (e) { }

    console.log("[*] Root & Emulator Bypass Injection Completed!");
});

console.log("[*] Injecting Native (libc) Hooks for ThreatMetrix...");

const TARGET_PATHS = [
    "/system/app/superuser.apk", "/sbin/su", "/system/bin/su", "/system/xbin/su",
    "/data/local/xbin/su", "/data/local/bin/su", "/system/sd/xbin/su",
    "/system/bin/failsafe/su", "/data/local/su", "/su/bin/su",
    "/system/app/magisk.apk", "/data/adb/magisk", "/data/local/tmp/frida",
    "/data/local/tmp/frida-server", "/data/local/tmp/frida-gadget.so",
    "/proc/self/maps", "/proc/self/smaps", "/proc/self/mounts",
    "/proc/net/tcp", "/proc/net/unix"
];

function isBadPath(pathStr, returnAddress) {
    if (!pathStr) return false;
    pathStr = pathStr.toLowerCase();

    let isRootPath = false;
    for (let i = 0; i < TARGET_PATHS.length; i++) {
        if (pathStr == TARGET_PATHS[i] || pathStr.endsWith("/su") || pathStr.endsWith("/magisk") || pathStr.indexOf("frida") !== -1) {
            isRootPath = true;
            break;
        }
    }

    if (!isRootPath) return false;

    if (pathStr.indexOf("/proc/self/") !== -1 || pathStr.indexOf("frida") !== -1) {
        if (returnAddress) {
            let mod = Process.findModuleByAddress(returnAddress);
            if (mod) {
                let mName = mod.name.toLowerCase();
                if (mName.indexOf("tmx") === -1 && mName.indexOf("akamai") === -1 && mName.indexOf("tool-file") === -1) {
                    return false;
                }
            }
        }
    }

    return true;
}

try {
    console.log("[DEBUG] Hooking fopen...");
    const fopenPtr = Process.getModuleByName("libc.so").findExportByName("fopen");
    if (fopenPtr) {
        Interceptor.attach(fopenPtr, {
            onEnter: function (args) {
                try {
                    let ptr = args[0];
                    if (ptr) {
                        this.path = ptr.readUtf8String();
                        if (isBadPath(this.path, this.returnAddress)) {
                            console.log("[+] Native Blocked fopen: " + this.path);
                            args[0] = Memory.allocUtf8String("/nonexistent_path_bypassed");
                        }
                    }
                } catch (ext) {
                    console.log("Error in fopen onEnter: " + ext.stack);
                }
            }
        });
    }

    console.log("[DEBUG] Hooking access...");
    const accessPtr = Process.getModuleByName("libc.so").findExportByName("access");
    if (accessPtr) {
        Interceptor.attach(accessPtr, {
            onEnter: function (args) {
                try {
                    let ptr = args[0];
                    if (ptr) {
                        this.path = ptr.readUtf8String();
                        if (isBadPath(this.path, this.returnAddress)) {
                            console.log("[+] Native Blocked access: " + this.path);
                            args[0] = Memory.allocUtf8String("/nonexistent_path_bypassed");
                        }
                    }
                } catch (ext) {
                    console.log("Error in access onEnter: " + ext.stack);
                }
            }
        });
    }

    console.log("[DEBUG] Hooking faccessat...");
    const faccessatPtr = Process.getModuleByName("libc.so").findExportByName("faccessat");
    if (faccessatPtr) {
        Interceptor.attach(faccessatPtr, {
            onEnter: function (args) {
                try {
                    let ptr = args[1];
                    if (ptr) {
                        this.path = ptr.readUtf8String();
                        if (isBadPath(this.path, this.returnAddress)) {
                            console.log("[+] Native Blocked faccessat: " + this.path);
                            args[1] = Memory.allocUtf8String("/nonexistent_path_bypassed");
                        }
                    }
                } catch (ext) { }
            }
        });
    }

    console.log("[DEBUG] Hooking open...");
    const openPtr = Process.getModuleByName("libc.so").findExportByName("open");
    if (openPtr) {
        Interceptor.attach(openPtr, {
            onEnter: function (args) {
                try {
                    let ptr = args[0];
                    if (ptr) {
                        this.path = ptr.readUtf8String();
                        if (isBadPath(this.path, this.returnAddress)) {
                            console.log("[+] Native Blocked open: " + this.path);
                            args[0] = Memory.allocUtf8String("/nonexistent_path_bypassed");
                        }
                    }
                } catch (ext) { }
            }
        });
    }

    console.log("[DEBUG] Hooking openat...");
    const openatPtr = Process.getModuleByName("libc.so").findExportByName("openat");
    if (openatPtr) {
        Interceptor.attach(openatPtr, {
            onEnter: function (args) {
                try {
                    let ptr = args[1];
                    if (ptr) {
                        this.path = ptr.readUtf8String();
                        if (isBadPath(this.path, this.returnAddress)) {
                            console.log("[+] Native Blocked openat: " + this.path);
                            args[1] = Memory.allocUtf8String("/nonexistent_path_bypassed");
                        }
                    }
                } catch (ext) { }
            }
        });
    }

    console.log("[DEBUG] Hooking stat/lstat...");
    const statFiles = ["stat", "lstat", "stat64", "lstat64"];
    for (let i = 0; i < statFiles.length; i++) {
        const ptr = Process.getModuleByName("libc.so").findExportByName(statFiles[i]);
        if (ptr) {
            Interceptor.attach(ptr, {
                onEnter: function (args) {
                    try {
                        let p = args[0];
                        if (p) {
                            this.path = p.readUtf8String();
                            if (isBadPath(this.path, this.returnAddress)) {
                                console.log("[+] Native Blocked " + statFiles[i] + ": " + this.path);
                                args[0] = Memory.allocUtf8String("/nonexistent_path_bypassed");
                            }
                        }
                    } catch (ext) { }
                }
            });
        }
    }
} catch (err) {
    console.log("[-] Error in native hooks: " + err.stack);
}

console.log("[*] Root, Emulator & Native ThreatMetrix Bypass Injection Completed!");
