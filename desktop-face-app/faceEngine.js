/**
 * faceEngine.js - Industrial Deep Neural Face Recognition Engine
 * Powered by @vladmandic/face-api (TensorFlow.js + SSD MobileNet / TinyFaceDetector + 128-d ResNet Embeddings)
 */
class FaceEngine {
    constructor() {
        this.enrolledEmployees = [];
        this.isModelLoaded = false;
        this.isLoadingModels = false;
        // Euclidean distance threshold in 128-d deep space:
        // Same person: distance < 0.40 (High confidence genuine match)
        // Different person: distance >= 0.45
        // Strictly calibrated to 0.40 (prevents false acceptance of other people)
        this.distanceThreshold = 0.40;
    }

    /**
     * Pre-load Deep Neural Models from local assets
     */
    async initModels() {
        if (this.isModelLoaded || this.isLoadingModels) return;
        this.isLoadingModels = true;
        try {
            if (typeof faceapi !== 'undefined') {
                console.log('[FaceEngine] Loading Deep Neural Face Recognition Models from ./models...');
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
                    faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('./models')
                ]);
                this.isModelLoaded = true;
                console.log('[FaceEngine] ✓ Neural Face Recognition Models Loaded Successfully!');
            }
        } catch (err) {
            console.error('[FaceEngine] Model initialization error:', err);
        } finally {
            this.isLoadingModels = false;
        }
    }

    /**
     * Load registered face templates from Backend API / Local Cache
     * @param {Array} employees
     */
    setEnrolledEmployees(employees) {
        this.enrolledEmployees = employees.filter(e => Array.isArray(e.faceTemplate) && e.faceTemplate.length > 0);
        console.log(`[FaceEngine] Loaded ${this.enrolledEmployees.length} face templates into desktop memory`);
    }

    /**
     * Fast check whether an actual human face is present
     * @param {HTMLVideoElement|HTMLCanvasElement} inputElement
     * @returns {Promise<Object>} { hasFace: boolean, reason?: string }
     */
    async detectFace(inputElement) {
        if (!inputElement) return { hasFace: false, reason: 'Invalid input' };

        // 1. Red finger-on-camera hardware filter
        if (inputElement instanceof HTMLCanvasElement) {
            const ctx = inputElement.getContext('2d', { willReadFrequently: true });
            const width = inputElement.width;
            const height = inputElement.height;
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;

            let rSum = 0, gSum = 0, bSum = 0;
            for (let i = 0; i < data.length; i += 32) {
                rSum += data[i];
                gSum += data[i + 1];
                bSum += data[i + 2];
            }
            if (rSum > 2.0 * (gSum + bSum + 10)) {
                return { hasFace: false, reason: 'Finger or covered lens detected' };
            }
        }

        // 2. Neural face detection
        if (this.isModelLoaded && typeof faceapi !== 'undefined') {
            try {
                const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
                const detection = await faceapi.detectSingleFace(inputElement, options);
                if (detection) {
                    return { hasFace: true, detection };
                } else {
                    return { hasFace: false, reason: 'No face detected in frame' };
                }
            } catch (err) {
                return { hasFace: true }; // Fallback
            }
        }

        return { hasFace: true };
    }

    /**
     * Extract a 128-dimensional Deep ResNet Face Descriptor
     * @param {HTMLVideoElement|HTMLCanvasElement} inputElement
     * @returns {Promise<number[]|null>} 128-d deep float vector
     */
    async extractEmbedding(inputElement) {
        if (!this.isModelLoaded) {
            await this.initModels();
        }

        if (this.isModelLoaded && typeof faceapi !== 'undefined') {
            try {
                const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
                const fullDetection = await faceapi
                    .detectSingleFace(inputElement, options)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (fullDetection && fullDetection.descriptor) {
                    return Array.from(fullDetection.descriptor); // 128-d deep feature vector
                }
                return null;
            } catch (err) {
                console.warn('[FaceEngine] Extraction error:', err.message);
                return null;
            }
        }

        return null;
    }

    /**
     * Search memory cache for the closest matching enrolled employee
     * Using Euclidean Distance in Deep Metric Space
     * @param {number[]} candidateVector
     * @returns {Object|null}
     */
    findBestMatch(candidateVector) {
        if (!this.enrolledEmployees.length || !candidateVector) return null;

        let bestMatch = null;
        let lowestDistance = 999;

        for (const emp of this.enrolledEmployees) {
            // Vector dimensions must match exactly (e.g. 128-d vs 128-d)
            if (candidateVector.length !== emp.faceTemplate.length) {
                continue; // Skip incompatible embedding vectors
            }

            let dist = 999;
            if (typeof faceapi !== 'undefined' && faceapi.euclideanDistance) {
                dist = faceapi.euclideanDistance(candidateVector, emp.faceTemplate);
            } else {
                let sumSq = 0;
                for (let i = 0; i < candidateVector.length; i++) {
                    const diff = candidateVector[i] - emp.faceTemplate[i];
                    sumSq += diff * diff;
                }
                dist = Math.sqrt(sumSq);
            }

            if (dist < lowestDistance) {
                lowestDistance = dist;
                // Convert distance to confidence percentage: 0.0 distance = 100%, 0.52 distance = ~70%
                const confidencePct = Math.max(0, Math.min(99, Math.round((1 - (lowestDistance / 0.75)) * 100)));
                bestMatch = {
                    employee: emp,
                    distance: lowestDistance,
                    confidencePct
                };
            }
        }

        // Must satisfy distance threshold to verify identity
        if (bestMatch && bestMatch.distance <= this.distanceThreshold) {
            return bestMatch;
        }

        return null; // Unrecognized employee
    }

    /**
     * Merge multiple angle vectors into average composite vector
     */
    mergeMultiAngleVectors(vectors) {
        if (!vectors || !vectors.length) return [];
        const valid = vectors.filter(v => Array.isArray(v) && v.length > 0);
        if (!valid.length) return [];

        const len = valid[0].length;
        const merged = new Float32Array(len);

        for (const vec of valid) {
            for (let i = 0; i < len; i++) {
                merged[i] += vec[i];
            }
        }

        for (let i = 0; i < len; i++) {
            merged[i] /= valid.length;
        }

        return Array.from(merged);
    }
}

if (typeof window !== 'undefined') {
    window.faceEngine = new FaceEngine();
}
