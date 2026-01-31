# Workout Creator

AI-Powered Workout Creator for turbo trainers. Create structured cycling workouts from natural language descriptions, screenshots, or workout files.

## Features

- **Text-to-Workout**: Describe your workout in plain English, and AI generates a structured workout
- **Image Upload**: Upload a screenshot of a workout from Zwift/TrainerRoad, and AI extracts the structure
- **File Import**: Import .zwo (Zwift) and .fit workout files
- **Interactive Visualization**: View your workout as a power graph with hover details
- **Export**: Export workouts to .zwo format for use in Zwift
- **Local Storage**: Your FTP and saved workouts persist in your browser

## Getting Started

### Prerequisites

- Node.js 18+
- A Google AI (Gemini) API key

### Installation

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd workoutcreator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file with your Gemini API key:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

   Get your API key at https://aistudio.google.com/app/apikey

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Creating a Workout with AI

1. Enter a description of your desired workout in the text box, e.g.:
   - "30 minute sweetspot workout"
   - "VO2max intervals, I only have 20 minutes"
   - "Easy recovery spin for 45 minutes"

2. The AI will generate a complete workout with warm-up, main set, and cool-down.

3. If the AI needs more information, it will ask ONE clarifying question.

### Importing from File

Click "Upload File" and select a `.zwo` (Zwift) or `.fit` file.

### Importing from Image

Click "Upload Image" and select a screenshot or photo of a workout.

### Settings

Click "Settings" to configure your FTP (Functional Threshold Power). This is used to calculate power zones and training metrics.

### Exporting

After creating or importing a workout, click "Export" to:
- Download as .zwo (for Zwift)
- Download as .json
- Copy a shareable link

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS v4
- Google Gemini API (for AI features)

## License

MIT
