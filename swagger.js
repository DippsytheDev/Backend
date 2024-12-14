const swaggerJsDoc = require("swagger-jsdoc");

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Booking API",
    version: "1.0.0",
    description: "API for booking services with email notifications and unavailable time fetching",
    contact: {
      name: "Support",
      email: "support@makeupbybims.com",
    },
  },
  servers: [
    {
      url: "http://localhost:3001",
      description: "Local Development Server",
    },
  ],
  components: {
    schemas: {
      Booking: {
        type: "object",
        properties: {
          name: { type: "string", example: "Jane Doe" },
          email: { type: "string", example: "jane.doe@example.com" },
          number: { type: "string", example: "+1234567890" },
          address: { type: "string", example: "123 Calgary Ave" },
          service: { type: "string", example: "Makeup Service" },
          additionService: { type: "string", example: "Hair Styling" },
          date: { type: "string", format: "date-time", example: "2024-12-25T15:00:00Z" },
          message: { type: "string", example: "Please arrive early." },
        },
      },
      // Add other schemas if necessary
    },
  },
  paths: {
    "/book": {
      post: {
        summary: "Create a new booking",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Booking" },
            },
          },
        },
        responses: {
          200: { description: "Booking created successfully" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/bookings/unavailable-times": {
      get: {
        summary: "Get unavailable times for a specific date",
        parameters: [
          {
            name: "date",
            in: "query",
            required: true,
            schema: { type: "string", format: "date", example: "2024-12-25" },
          },
        ],
        responses: {
          200: {
            description: "Unavailable times fetched successfully",
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "string" } },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
  },
};

const swaggerOptions = {
  swaggerDefinition,
  apis: [],
};

module.exports = swaggerJsDoc(swaggerOptions);
