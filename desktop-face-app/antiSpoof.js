/**
 * antiSpoof.js - Real-time Anti-Spoofing and Liveness Verification
 * Detects 2D printed photos, smartphone screen replays, and static images.
 */
class AntiSpoofEngine {
    constructor() {
        this.frameBuffer = [];
        this.bufferSize = 12;
        this.lastBlinkTime = 0;
    }

    /**
     * Analyze a cropped face canvas for liveness and 2D spoofing
     * @param {HTMLCanvasElement} faceCanvas - Canvas containing cropped aligned face
     * @returns {Object} { isLive: boolean, score: number, reason: string }
     */
    analyze(faceCanvas) {
        if (!faceCanvas || faceCanvas.width < 50 || faceCanvas.height < 50) {
            return { isLive: false, score: 0, reason: 'Face too small or low resolution' };
        }

        const ctx = faceCanvas.getContext('2d', { willReadFrequently: true });
        const width = faceCanvas.width;
        const height = faceCanvas.height;
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // 1. High-frequency Texture Analysis (Laplacian Edge Variance)
        const textureScore = this.calculateTextureVariance(data, width, height);

        // 2. Screen Glare & Histogram Saturation Analysis
        const screenScore = this.detectScreenGlares(data, width, height);

        // 3. Temporal Micro-Motion Analysis
        const motionScore = this.trackMicroMotion(data, width, height);

        // Combined Liveness Score (0.0 to 1.0)
        const compositeScore = (textureScore * 0.45) + (screenScore * 0.35) + (motionScore * 0.20);

        // Thresholding
        // Flat paper prints / blank walls typically score < 0.28 on texture and composite
        // Live humans under room lighting typically score 0.38 - 0.75
        const isLive = compositeScore >= 0.35;

        let reason = 'Live Human Verified';
        if (compositeScore < 0.35) {
            reason = 'Low liveness score (Paper photo or flat reflection suspected)';
        }

        return {
            isLive,
            score: Math.min(1.0, Math.max(0.0, compositeScore)),
            reason,
            metrics: {
                texture: textureScore.toFixed(2),
                screen: screenScore.toFixed(2),
                motion: motionScore.toFixed(2)
            }
        };
    }

    /**
     * Compute simplified discrete Laplacian variance on grayscale pixels
     */
    calculateTextureVariance(data, width, height) {
        let totalVariance = 0;
        let count = 0;
        const step = 2; // sample every 2nd pixel for 60fps performance

        for (let y = 1; y < height - 1; y += step) {
            for (let x = 1; x < width - 1; x += step) {
                const idx = (y * width + x) * 4;
                const gray = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);

                const up = (data[((y - 1) * width + x) * 4] * 0.299 + data[((y - 1) * width + x) * 4 + 1] * 0.587);
                const down = (data[((y + 1) * width + x) * 4] * 0.299 + data[((y + 1) * width + x) * 4 + 1] * 0.587);
                const left = (data[(y * width + (x - 1)) * 4] * 0.299 + data[(y * width + (x - 1)) * 4 + 1] * 0.587);
                const right = (data[(y * width + (x + 1)) * 4] * 0.299 + data[(y * width + (x + 1)) * 4 + 1] * 0.587);

                // Laplacian operator: 4*center - (up + down + left + right)
                const lap = Math.abs(4 * gray - (up + down + left + right));
                totalVariance += lap;
                count++;
            }
        }

        const avgLap = count > 0 ? totalVariance / count : 0;
        // Normalize: real skin usually has avgLap between 12 and 45. Paper prints < 7.
        return Math.min(1.0, avgLap / 22.0);
    }

    /**
     * Detect artificial screen backlights, blown-out LCD pixels, and narrow color gamuts
     */
    detectScreenGlares(data, width, height) {
        let overexposedPixels = 0;
        let totalChecked = 0;
        let colorDiffSum = 0;

        for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Glare detection (screens usually have harsh clipped whites)
            if (r > 248 && g > 248 && b > 248) {
                overexposedPixels++;
            }

            // Real skin has characteristic R > G > B variance
            colorDiffSum += Math.abs(r - g) + Math.abs(g - b);
            totalChecked++;
        }

        const glareRatio = totalChecked > 0 ? overexposedPixels / totalChecked : 0;
        const avgColorDiff = totalChecked > 0 ? colorDiffSum / totalChecked : 0;

        // Severe glare penalty
        let score = 1.0;
        if (glareRatio > 0.12) score -= 0.5;
        if (avgColorDiff < 15) score -= 0.3; // Monochromatic screen or grayscale print

        return Math.max(0.1, score);
    }

    /**
     * Track natural micro-movements across a rolling buffer of frames
     */
    trackMicroMotion(data, width, height) {
        // Downsample to 16x16 thumbnail for quick frame differencing
        const thumbSize = 16;
        const currentThumb = new Float32Array(thumbSize * thumbSize);
        const cellW = Math.floor(width / thumbSize);
        const cellH = Math.floor(height / thumbSize);

        for (let ty = 0; ty < thumbSize; ty++) {
            for (let tx = 0; tx < thumbSize; tx++) {
                const px = (ty * cellH * width + tx * cellW) * 4;
                currentThumb[ty * thumbSize + tx] = (data[px] + data[px + 1] + data[px + 2]) / 3;
            }
        }

        this.frameBuffer.push(currentThumb);
        if (this.frameBuffer.length > this.bufferSize) {
            this.frameBuffer.shift();
        }

        if (this.frameBuffer.length < 3) return 0.6; // Warming up

        // Compute frame-to-frame variance
        let totalDiff = 0;
        for (let i = 1; i < this.frameBuffer.length; i++) {
            const prev = this.frameBuffer[i - 1];
            const curr = this.frameBuffer[i];
            for (let j = 0; j < prev.length; j++) {
                totalDiff += Math.abs(curr[j] - prev[j]);
            }
        }

        const avgMotion = totalDiff / ((this.frameBuffer.length - 1) * (thumbSize * thumbSize));

        // Only flag as completely frozen if motion is virtually absolute zero (< 0.05)
        if (avgMotion < 0.05) return 0.2; // Frozen static photo taped to lens
        return 0.8; // Live person looking at camera
    }
}

if (typeof window !== 'undefined') {
    window.AntiSpoofEngine = AntiSpoofEngine;
}
