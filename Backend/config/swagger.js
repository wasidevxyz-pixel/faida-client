const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'BAS (Business Accounting Software) API Documentation',
            version: '1.2.2',
            description: 'Professional API documentation for the BAS Accounting System. This documentation is intended for enterprise integration and technical auditing.',
            contact: {
                name: 'Technical Support',
                email: 'support@bas-software.com'
            }
        },
        servers: [
            {
                url: 'http://localhost:5000',
                description: 'Development Server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                },
                apiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key'
                },
                apiSecretAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-secret'
                }
            }
        },
        security: [
            {
                bearerAuth: []
            }
        ]
    },
    // Paths to files containing OpenAPI definitions
    apis: ['./routes/*.js', './middleware/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
// This configuration sets up Swagger for the BAS API, providing detailed information about the API, including security schemes for authentication. The documentation is designed to be professional and comprehensive, suitable for enterprise use.
// added by mr wasi github.com/itxxwasi 
// Note: Ensure that the paths in the 'apis' array correctly point to the files where your API routes and middleware are defined, as this is where Swagger will look for JSDoc comments to generate the documentation.