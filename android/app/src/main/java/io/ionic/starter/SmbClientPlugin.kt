package io.ionic.starter

import android.net.Uri
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import jcifs.CIFSContext
import jcifs.context.SingletonContext
import jcifs.smb.NtlmPasswordAuthenticator
import jcifs.smb.SmbFile
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import android.util.Base64

@CapacitorPlugin(name = "SmbClient")
class SmbClientPlugin : Plugin() {

    /**
     * Builds an authenticated jcifs-ng context for one call. Cheap enough
     * to build per-call given how infrequent these operations are.
     */
    private fun contextFor(username: String, password: String): CIFSContext {
        val auth = NtlmPasswordAuthenticator("", username, password)
        return SingletonContext.getInstance().withCredentials(auth)
    }

    private fun buildSmbUrl(ip: String, share: String, path: String): String {
        val cleanPath = path.trim().removePrefix("/")
        return if (cleanPath.isEmpty()) {
            "smb://$ip/$share/"
        } else {
            "smb://$ip/$share/$cleanPath/"
        }
    }

    private fun buildSmbFileUrl(ip: String, share: String, path: String): String {
        val cleanPath = path.trim().removePrefix("/")
        return "smb://$ip/$share/$cleanPath"
    }

    // ============================================================
    // listDir
    // ============================================================
    @PluginMethod
    fun listDir(call: PluginCall) {
        val ip = call.getString("ip") ?: return call.reject("Missing ip")
        val share = call.getString("share") ?: return call.reject("Missing share")
        val username = call.getString("username") ?: ""
        val password = call.getString("password") ?: ""
        val path = call.getString("path") ?: "/"

        Thread {
            try {
                val ctx = contextFor(username, password)
                val dirUrl = buildSmbUrl(ip, share, path)
                val dir = SmbFile(dirUrl, ctx)

                if (!dir.exists() || !dir.isDirectory) {
                    throw IllegalStateException("Directory not found: $path")
                }

                val items = JSArray()
                for (f in dir.listFiles()) {
                    val entry = JSObject()
                    val name = f.name.trimEnd('/')
                    entry.put("name", name)
                    entry.put("isDir", f.isDirectory)
                    entry.put(
                        "path",
                        (if (path == "/" || path.isEmpty()) "" else path.trimEnd('/')) + "/" + name
                    )
                    try {
                        entry.put("size", f.length())
                    } catch (_: Exception) {
                    }
                    try {
                        entry.put("modifiedAt", f.lastModified())
                    } catch (_: Exception) {
                    }
                    items.put(entry)
                }

                val result = JSObject()
                result.put("items", items)
                activity.runOnUiThread { call.resolve(result) }
            } catch (e: Exception) {
                activity.runOnUiThread { call.reject("listDir failed: ${e.message}", e) }
            }
        }.start()
    }

    // ============================================================
    // uploadFile  — streams from a local file URI, no base64 arg
    // ============================================================
    @PluginMethod
    fun uploadFile(call: PluginCall) {
        val ip = call.getString("ip") ?: return call.reject("Missing ip")
        val share = call.getString("share") ?: return call.reject("Missing share")
        val username = call.getString("username") ?: ""
        val password = call.getString("password") ?: ""
        val remotePath = call.getString("remotePath") ?: return call.reject("Missing remotePath")
        val localUri = call.getString("localUri") ?: return call.reject("Missing localUri")

        Thread {
            try {
                val ctx = contextFor(username, password)
                val smbUrl = buildSmbFileUrl(ip, share, remotePath)
                val smbFile = SmbFile(smbUrl, ctx)

                val resolver = context.contentResolver
                val inputStream = resolver.openInputStream(Uri.parse(localUri))
                    ?: throw IllegalStateException("Unable to open local file: $localUri")

                BufferedInputStream(inputStream).use { input ->
                    BufferedOutputStream(smbFile.outputStream).use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                        }
                        output.flush()
                    }
                }

                val result = JSObject()
                result.put("ok", true)
                activity.runOnUiThread { call.resolve(result) }
            } catch (e: Exception) {
                activity.runOnUiThread { call.reject("Upload failed: ${e.message}", e) }
            }
        }.start()
    }

    // ============================================================
    // createFolder
    // ============================================================
    @PluginMethod
    fun createFolder(call: PluginCall) {
        val ip = call.getString("ip") ?: return call.reject("Missing ip")
        val share = call.getString("share") ?: return call.reject("Missing share")
        val username = call.getString("username") ?: ""
        val password = call.getString("password") ?: ""
        val path = call.getString("path") ?: return call.reject("Missing path")

        Thread {
            try {
                val ctx = contextFor(username, password)
                val dirUrl = buildSmbUrl(ip, share, path)
                val dir = SmbFile(dirUrl, ctx)
                if (!dir.exists()) {
                    dir.mkdirs()
                }
                val result = JSObject()
                result.put("ok", true)
                activity.runOnUiThread { call.resolve(result) }
            } catch (e: Exception) {
                activity.runOnUiThread { call.reject("createFolder failed: ${e.message}", e) }
            }
        }.start()
    }

    // ============================================================
    // downloadToCache
    // ============================================================
    @PluginMethod
    fun downloadToCache(call: PluginCall) {
        val ip = call.getString("ip") ?: return call.reject("Missing ip")
        val share = call.getString("share") ?: return call.reject("Missing share")
        val username = call.getString("username") ?: ""
        val password = call.getString("password") ?: ""
        val remotePath = call.getString("remotePath") ?: return call.reject("Missing remotePath")

        Thread {
            try {
                val ctx = contextFor(username, password)
                val smbUrl = buildSmbFileUrl(ip, share, remotePath)
                val smbFile = SmbFile(smbUrl, ctx)

                val fileName = smbFile.name.trimEnd('/')
                val cacheFile = java.io.File(context.cacheDir, "dl_${System.currentTimeMillis()}_$fileName")

                BufferedInputStream(smbFile.inputStream).use { input ->
                    BufferedOutputStream(cacheFile.outputStream()).use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                        }
                        output.flush()
                    }
                }

                val uri = Uri.fromFile(cacheFile).toString()
                val result = JSObject()
                result.put("localUri", uri)
                activity.runOnUiThread { call.resolve(result) }
            } catch (e: Exception) {
                activity.runOnUiThread { call.reject("downloadToCache failed: ${e.message}", e) }
            }
        }.start()
    }

    // ============================================================
    // readFile — returns base64 (fine for smaller files; for very
    // large DICOM reads, prefer downloadToCache + smbReadFileBase64
    // is not recommended, use downloadToCache instead on the JS side)
    // ============================================================
    @PluginMethod
    fun readFile(call: PluginCall) {
        val ip = call.getString("ip") ?: return call.reject("Missing ip")
        val share = call.getString("share") ?: return call.reject("Missing share")
        val username = call.getString("username") ?: ""
        val password = call.getString("password") ?: ""
        val path = call.getString("path") ?: return call.reject("Missing path")

        Thread {
            try {
                val ctx = contextFor(username, password)
                val smbUrl = buildSmbFileUrl(ip, share, path)
                val smbFile = SmbFile(smbUrl, ctx)

                val output = ByteArrayOutputStream()
                BufferedInputStream(smbFile.inputStream).use { input ->
                    val buffer = ByteArray(64 * 1024)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                    }
                }

                val base64 = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
                val result = JSObject()
                result.put("base64", base64)
                activity.runOnUiThread { call.resolve(result) }
            } catch (e: Exception) {
                activity.runOnUiThread { call.reject("readFile failed: ${e.message}", e) }
            }
        }.start()
    }
}