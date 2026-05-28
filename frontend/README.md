# AFRIXORA Frontend

Frontend dashboard for the AFRIXORA Global IoT Intelligence Platform.

## Technologies

- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Zustand for state management
- Axios for API requests
- Socket.IO for real-time updates

## Getting Started

### Prerequisites

- Node.js 20.x or later
- npm 9.x or later

### Installation

1. Clone the repository
2. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the environment variables file:
   ```bash
   cp .env.example .env.local
   ```
5. Update the environment variables in `.env.local` as needed

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### Building for Production

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Authentication routes (login)
│   │   └── (dashboard)/        # Dashboard routes (protected)
│   ├── components/             # Reusable components
│   │   ├── ui/                 # shadcn/ui components
│   │   └── layout/             # Layout components (Sidebar, Header)
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utility functions
│   │   ├── api.ts              # Axios instance with interceptors
│   │   ├── auth.ts             # Authentication utilities
│   │   └── utils.ts            # General utilities
│   └── store/                  # Zustand global state
├── public/                     # Static assets
├── .env.example                # Example environment variables
├── package.json                # Project dependencies
├── tailwind.config.ts          # Tailwind CSS configuration
└── tsconfig.json               # TypeScript configuration
```

## Authentication

The application uses JWT authentication. The token is stored in localStorage and automatically included in API requests via the Axios interceptor.

## Features

- Authentication (login)
- Dashboard with key metrics
- Building management
- Device control
- Energy monitoring
- Automation rules
- Alerts and notifications
- Reports generation

## Docker

A Dockerfile is provided for containerization. Build the Docker image:

```bash
docker build -t afrixora-frontend .
```

Run the container:

```bash
docker run -p 3000:3000 afrixora-frontend