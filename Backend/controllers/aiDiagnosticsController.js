const SystemLog = require('../models/SystemLog');

/**
 * AI Diagnostic Controller
 * Responsible for analyzing logs and suggesting fixes
 */
exports.diagnoseLog = async (req, res) => {
    try {
        const { id } = req.params;
        const log = await SystemLog.findById(id);

        if (!log) {
            return res.status(404).json({ success: false, message: 'Log not found' });
        }

        const message = log.message || '';
        const stack = log.meta?.stack || '';
        const url = log.meta?.url || 'Internal';
        const type = log.type || 'system';

        // In a full production environment, this would call an AI API (Gemini/OpenAI) 
        // with the log details. For now, we use a sophisticated diagnostic generator 
        // to provide instant, safe advice based on the log pattern.

        const diagnostic = generateSafeDiagnostic(message, stack, url, type);

        res.status(200).json({
            success: true,
            data: {
                logId: id,
                diagnostic
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * Generates technical advice based on log patterns
 * This is the "Advisor" engine
 */
function generateSafeDiagnostic(message, stack, url, type) {
    let analysis = "The system detected an issue during processing.";
    let rootCause = "Unknown internal error.";
    let steps = ["Check the system console for more details.", "Verify database connectivity."];

    // Pattern Matching for Common Software Issues
    if (message.includes(' 404 ') || message.includes(' 404(')) {
        analysis = "File or Resource Not Found (404).";
        rootCause = `The browser or a service tried to access a URL that doesn't exist on this server: ${url}`;
        steps = [
            "If this is a .json or .map file, it's usually harmless noise from browser extensions.",
            "If this is a page you need, check if the link or file name is spelled correctly.",
            "Verify the file exists in the 'Frontend/public' folder."
        ];
    } else if (message.includes(' 500 ') || message.includes(' 500(')) {
        analysis = "Internal Server Processing Error (500).";
        rootCause = "The server encountered an unexpected condition while trying to fulfill the request. This is usually a bug in the code logic.";
        steps = [
            "Look at the 'Raw Metadata' below to see the exact error details.",
            "Check the 'Technical Error Details' if available for a stack trace.",
            "Restart the server service to clear potential memory hang-ups."
        ];
    } else if (message.includes(' 200 ') || message.includes(' 201 ')) {
        analysis = "Successful Request Log.";
        rootCause = "The action was completed successfully by the server.";
        steps = [
            "No action required.",
            "This log is kept for tracking user activity and performance (Duration: " + (message.match(/\(\d+ms\)/) || ["---"])[0] + ")."
        ];
    } else if (message.includes('Cast to ObjectId failed') || message.includes('CastError')) {
        analysis = "Invalid Record reference detected.";
        rootCause = "The system tried to find a record using an ID that is either malformed (missing characters) or belongs to a different type of data.";
        steps = [
            "Check if you are using an old link or bookmark.",
            "Verify that the record you are trying to open hasn't been deleted by another user.",
            "If you manually typed the ID in the URL, verify it is correct."
        ];
    } else if (message.includes('E11000 duplicate key error')) {
        analysis = "Duplicate Data Entry prevention.";
        rootCause = "You are trying to save data (like a Code or Name) that must be unique, but it already exists in the database.";
        steps = [
            "Search for an existing record with the same Name or Code.",
            "Try using a different identifier.",
            "Refresh the list to see if the record was already created."
        ];
    } else if (message.includes('JWT') || message.includes('TokenExpired')) {
        analysis = "Security Session Expiry.";
        rootCause = "The secure connection between your browser and the server has timed out or become invalid.";
        steps = [
            "Log out of the system.",
            "Clear browser cache if the issue persists.",
            "Log back in to start a fresh secure session."
        ];
    } else if (message.includes('ValidationError')) {
        analysis = "Data Format Requirement Mismatch.";
        rootCause = "The information sent to the server is missing a mandatory field or is in the wrong format (e.g., text where a number is expected).";
        steps = [
            "Check all mandatory fields marked with * in the form.",
            "Ensure dates are in the correct format.",
            "Check for any red error labels on the input fields."
        ];
    } else if (message.includes('ENOTFOUND') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
        analysis = "Infrastructure Communication Failure.";
        rootCause = "The web server is unable to reach the database or an external API service.";
        steps = [
            "Check if the Database service is running.",
            "Verify internet connectivity on the server.",
            "Ensure no firewall is blocking internal port communications."
        ];
    } else if (message.includes('SyntaxError')) {
        analysis = "Logic/Code Execution Bug.";
        rootCause = "There is a technical error in the software's logic preventing it from running this specific task.";
        steps = [
            "Note down the exact steps you took before this error.",
            "Contact software support with the 'Message' and 'URL' shown above.",
            "Avoid performing this specific action until a patch is applied."
        ];
    } else if (message.includes('403') || message.includes('Forbidden') || message.includes(' 401 ')) {
        analysis = "Access Control Restriction.";
        rootCause = "Your user account does not have the required permissions or your session is unauthorized for this action.";
        steps = [
            "Contact your System Administrator.",
            "Check 'User Management' -> 'Group Rights' for your role.",
            "Try logging in again to refresh your access token."
        ];
    }

    return {
        analysis,
        rootCause,
        suggestedResolution: steps
    };
}

