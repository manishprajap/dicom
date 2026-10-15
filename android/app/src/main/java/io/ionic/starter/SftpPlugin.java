package io.ionic.starter;

import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Properties;
import java.util.Vector;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "SftpPlugin")
public class SftpPlugin extends Plugin {

    private static final String TAG = "SftpPlugin";
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void listDir(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 22);
        String user = call.getString("user");
        String password = call.getString("password");
        String path = call.getString("path", "/");

        if (host == null || user == null || password == null) {
            call.reject("host, user and password are required");
            return;
        }

        executor.execute(() -> {
            Session session = null;
            ChannelSftp channel = null;
            try {
                JSch jsch = new JSch();
                session = jsch.getSession(user, host, port);
                session.setPassword(password);

                Properties config = new Properties();
                config.put("StrictHostKeyChecking", "no");
                session.setConfig(config);
                session.setTimeout(15000);
                session.connect();

                channel = (ChannelSftp) session.openChannel("sftp");
                channel.connect();

                @SuppressWarnings("unchecked")
                Vector<ChannelSftp.LsEntry> list = channel.ls(path);

                JSArray entries = new JSArray();
                SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.US);

                for (ChannelSftp.LsEntry entry : list) {
                    String name = entry.getFilename();
                    if (name.equals(".") || name.equals("..")) continue;

                    SftpATTRS attrs = entry.getAttrs();

                    JSObject obj = new JSObject();
                    obj.put("name", name);

                    String fullPath = path.endsWith("/") ? path + name : path + "/" + name;
                    obj.put("path", fullPath);
                    obj.put("isDir", attrs.isDir());
                    obj.put("size", attrs.getSize());
                    obj.put("modified", dateFormat.format(new Date((long) attrs.getMTime() * 1000L)));

                    entries.put(obj);
                }

                JSObject result = new JSObject();
                result.put("entries", entries);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "listDir failed", e);
                call.reject(e.getMessage(), e);
            } finally {
                if (channel != null && channel.isConnected()) channel.disconnect();
                if (session != null && session.isConnected()) session.disconnect();
            }
        });
    }

    @PluginMethod
    public void downloadToCache(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 22);
        String user = call.getString("user");
        String password = call.getString("password");
        String path = call.getString("path");

        if (host == null || user == null || password == null || path == null) {
            call.reject("host, user, password and path are required");
            return;
        }

        executor.execute(() -> {
            Session session = null;
            ChannelSftp channel = null;
            try {
                JSch jsch = new JSch();
                session = jsch.getSession(user, host, port);
                session.setPassword(password);

                Properties config = new Properties();
                config.put("StrictHostKeyChecking", "no");
                session.setConfig(config);
                session.setTimeout(15000);
                session.connect();

                channel = (ChannelSftp) session.openChannel("sftp");
                channel.connect();

                String fileName = path.substring(path.lastIndexOf('/') + 1);
                File cacheDir = getContext().getCacheDir();
                File outFile = new File(cacheDir, fileName);

                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    channel.get(path, fos);
                }

                JSObject result = new JSObject();
                result.put("localUri", "file://" + outFile.getAbsolutePath());
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "downloadToCache failed", e);
                call.reject(e.getMessage(), e);
            } finally {
                if (channel != null && channel.isConnected()) channel.disconnect();
                if (session != null && session.isConnected()) session.disconnect();
            }
        });
    }

    @PluginMethod
    public void uploadFile(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 22);
        String user = call.getString("user");
        String password = call.getString("password");
        String localUriString = call.getString("localUri");
        String remotePath = call.getString("remotePath");
        String fileName = call.getString("fileName");

        if (host == null || user == null || password == null || localUriString == null || remotePath == null || fileName == null) {
            call.reject("Missing required parameters for uploadFile");
            return;
        }

        executor.execute(() -> {
            Session session = null;
            ChannelSftp channel = null;
            try {
                Uri uri = Uri.parse(localUriString);
                File localFile = new File(uri.getPath());

                if (!localFile.exists()) {
                    call.reject("Staged local file does not exist at path: " + uri.getPath());
                    return;
                }

                JSch jsch = new JSch();
                session = jsch.getSession(user, host, port);
                session.setPassword(password);

                Properties config = new Properties();
                config.put("StrictHostKeyChecking", "no");
                session.setConfig(config);
                session.setTimeout(25000);
                session.connect();

                channel = (ChannelSftp) session.openChannel("sftp");
                channel.connect();

                channel.cd(remotePath);

                try (FileInputStream fis = new FileInputStream(localFile)) {
                    channel.put(fis, fileName);
                }

                call.resolve();

            } catch (Exception e) {
                Log.e(TAG, "uploadFile failed", e);
                call.reject(e.getMessage(), e);
            } finally {
                if (channel != null && channel.isConnected()) channel.disconnect();
                if (session != null && session.isConnected()) session.disconnect();
            }
        });
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 22);
        String user = call.getString("user");
        String password = call.getString("password");
        String path = call.getString("path");
        String folderName = call.getString("folderName");

        if (host == null || user == null || password == null || path == null || folderName == null) {
            call.reject("Missing required parameters for mkdir");
            return;
        }

        executor.execute(() -> {
            Session session = null;
            ChannelSftp channel = null;
            try {
                JSch jsch = new JSch();
                session = jsch.getSession(user, host, port);
                session.setPassword(password);

                Properties config = new Properties();
                config.put("StrictHostKeyChecking", "no");
                session.setConfig(config);
                session.setTimeout(15000);
                session.connect();

                channel = (ChannelSftp) session.openChannel("sftp");
                channel.connect();

                String targetPath = path.endsWith("/") ? path + folderName : path + "/" + folderName;
                channel.mkdir(targetPath);

                call.resolve();

            } catch (Exception e) {
                Log.e(TAG, "mkdir failed", e);
                call.reject(e.getMessage(), e);
            } finally {
                if (channel != null && channel.isConnected()) channel.disconnect();
                if (session != null && session.isConnected()) session.disconnect();
            }
        });
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 22);
        String user = call.getString("user");
        String password = call.getString("password");
        String path = call.getString("path");

        if (host == null || user == null || password == null || path == null) {
            call.reject("Missing required parameters for deleteFile");
            return;
        }

        executor.execute(() -> {
            Session session = null;
            ChannelSftp channel = null;
            try {
                JSch jsch = new JSch();
                session = jsch.getSession(user, host, port);
                session.setPassword(password);

                Properties config = new Properties();
                config.put("StrictHostKeyChecking", "no");
                session.setConfig(config);
                session.setTimeout(15000);
                session.connect();

                channel = (ChannelSftp) session.openChannel("sftp");
                channel.connect();

                // Delete the file on the remote server
                channel.rm(path);

                call.resolve();

            } catch (Exception e) {
                Log.e(TAG, "deleteFile failed", e);
                call.reject(e.getMessage(), e);
            } finally {
                if (channel != null && channel.isConnected()) channel.disconnect();
                if (session != null && session.isConnected()) session.disconnect();
            }
        });
    }
}