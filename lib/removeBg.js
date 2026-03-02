import axios from "axios";
import FormData from "form-data";

/**
 * Fetch image from URL → Buffer
 */
async function fetchBuffer(url) {
    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000,
    });
    return Buffer.from(response.data);
}

/**
 * Remove background from image buffer
 * @param {Buffer} buffer - Image buffer
 * @param {string} filename - Original filename
 * @returns {Buffer} - PNG with transparent background
 */
export async function removeBg(buffer, filename = "image.png") {
    const form = new FormData();
    form.append("image", buffer, { filename });
    form.append("format", "png");
    form.append("model", "v1");

    const headers = {
        ...form.getHeaders(),
        "accept": "application/json, text/plain, */*",
        "x-client-version": "web",
        "x-locale": "en",
        "origin": "https://www.pixelcut.ai",
        "referer": "https://www.pixelcut.ai/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    const res = await axios.post(
        "https://api2.pixelcut.app/image/matte/v1",
        form,
        {
            headers,
            responseType: "arraybuffer",
            timeout: 60000,
            maxContentLength: 50 * 1024 * 1024,
        }
    );

    return Buffer.from(res.data);
}

/**
 * Remove background from URL
 * @param {string} url - Image URL
 * @returns {Buffer} - PNG with transparent background
 */
export async function removeBgFromUrl(url) {
    const buffer = await fetchBuffer(url);
    const filename = url.split("/").pop()?.split("?")[0] || "image.png";
    return removeBg(buffer, filename);
}
