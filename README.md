# 🏠 Spark Homes – Scope Estimator Pro

> A mobile-first Progressive Web App (PWA) for real estate acquisition teams to estimate renovation costs during on-site property walkthroughs.

Built as a production-ready offline-first inspection platform featuring intelligent cost estimation, AI-powered equipment recognition, voice-assisted inspections, and professional project exports.

![License](https://img.shields.io/badge/license-MIT-green)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2023-yellow)
![Mobile](https://img.shields.io/badge/Mobile-First-orange)

---

## 📱 Demo

| Dashboard | Room Inspection | AI Equipment Scan | Summary |
| --------- | --------------- | ----------------- | ------- |
| _(GIF)_   | _(GIF)_         | _(GIF)_           | _(GIF)_ |

---

# Overview

Estimating renovation costs during property walkthroughs is often a manual, paper-driven process.

Scope Estimator Pro digitizes the entire inspection workflow into a fast, mobile-first experience.

Agents can:

- Create multiple renovation projects
- Walk room-by-room through a property
- Estimate repair costs in real time
- Capture photos
- Scan equipment serial numbers
- Use voice to log repairs
- Export professional Excel reports
- Continue working completely offline

---

# ✨ Features

## Project Management

- Multiple inspection projects
- Auto-save
- Instant project switching
- Offline persistence
- Local-first architecture

---

## Property Walkthrough

- Dynamic room creation
- Unlimited room instances
- Grouped repair checklist
- Quantity management
- Price overrides
- Running estimate
- Inspection progress

---

## AI Features

### Voice Inspection Assistant

Log repairs naturally.

> "Replace vanity, install new toilet and paint walls."

↓

Automatically updates inspection checklist.

---

### Equipment Recognition

Capture

- HVAC
- Water Heater
- Appliances

Automatically extracts

- Manufacturer
- Model
- Serial Number
- Estimated Manufacture Year

using OCR.

---

### Smart Suggestions

Based on selected repairs the assistant recommends additional inspection items.

Example

Roof replacement

↓

Suggest

- Attic insulation
- Drywall damage
- Flashing inspection

---

## Export

Generate

- Excel Estimate
- ZIP Archive
- Photo Package
- Inspection Summary

---

# 🏗 Architecture

```text
                     ┌──────────────────────┐
                     │ Mobile UI (PWA)      │
                     └──────────┬───────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼

 Project Manager      Pricing Engine        AI Assistant

          │                     │                     │

          └──────────────┬──────┴──────────────┬─────┘
                         ▼                     ▼

                IndexedDB Storage      LocalStorage

                         │
                         ▼

                    Export Engine
```

---

# 🧠 AI Pipeline

```text
Camera

↓

Image Preprocessing

↓

OCR (Tesseract)

↓

Serial Number Extraction

↓

Manufacturer Detection

↓

Equipment Metadata

↓

Bind to Inspection Item
```

---

Voice Assistant

```text
Speech

↓

Speech Recognition

↓

LLM Parsing

↓

Repair Classification

↓

Quantity Detection

↓

Checklist Update
```

---

# ⚙ Tech Stack

### Frontend

- HTML5
- TailwindCSS
- Vanilla JavaScript

### Storage

- IndexedDB
- LocalStorage

### AI

- Tesseract.js
- Web Speech API

### Export

- SheetJS
- JSZip

### PWA

- Service Workers
- Web App Manifest
- Cache API

---

# 📂 Project Structure

```text
src/

├── app/

├── components/

├── pages/

├── storage/

├── pricing/

├── ai/

│ ├── ocr/

│ ├── speech/

│ └── suggestions/

├── export/

└── utils/
```

---

# 📈 Performance

| Metric            | Value     |
| ----------------- | --------- |
| First Load        | < 1.5 sec |
| Offline Support   | ✅        |
| Mobile Optimized  | ✅        |
| Local Persistence | ✅        |
| PWA Installable   | ✅        |

---

# Design Principles

- Mobile-first
- Offline-first
- Touch optimized
- Fast field workflow
- Progressive disclosure
- Minimal cognitive load

---

# Future Roadmap

- Cloud synchronization
- Multi-user collaboration
- PDF inspection reports
- AI repair cost prediction
- Property valuation
- Contractor estimates
- GIS integration
- Calendar scheduling

---

# Screenshots

## Dashboard

(image)

---

## Room Inspection

(image)

---

## AI Equipment Scanner

(image)

---

## Summary

(image)

---

# Why this project?

This project demonstrates modern frontend engineering practices including offline-first architecture, Progressive Web Apps, local AI inference, structured state management, mobile UX, browser APIs, and production-grade export workflows.

---
