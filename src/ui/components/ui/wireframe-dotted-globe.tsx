"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"

interface RotatingEarthProps {
    width?: number
    height?: number
    className?: string
}

export default function RotatingEarth({ width = 800, height = 600, className = "" }: RotatingEarthProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!canvasRef.current) return

        const canvas = canvasRef.current
        const context = canvas.getContext("2d")
        if (!context) return

        // Set up responsive dimensions
        const containerWidth = Math.min(width, window.innerWidth - 40)
        const containerHeight = Math.min(height, window.innerHeight - 100)
        const radius = Math.min(containerWidth, containerHeight) / 2.5

        const dpr = window.devicePixelRatio || 1
        canvas.width = containerWidth * dpr
        canvas.height = containerHeight * dpr
        canvas.style.width = `${containerWidth}px`
        canvas.style.height = `${containerHeight}px`
        context.scale(dpr, dpr)

        // Create projection and path generator for Canvas
        const projection = d3
            .geoOrthographic()
            .scale(radius)
            .translate([containerWidth / 2, containerHeight / 2])
            .clipAngle(90)

        const path = d3.geoPath().projection(projection).context(context)

        const pointInPolygon = (point: [number, number], polygon: number[][]): boolean => {
            const [x, y] = point
            let inside = false

            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const [xi, yi] = polygon[i]
                const [xj, yj] = polygon[j]

                if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
                    inside = !inside
                }
            }

            return inside
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pointInFeature = (point: [number, number], feature: any): boolean => {
            const geometry = feature.geometry

            if (geometry.type === "Polygon") {
                const coordinates = geometry.coordinates
                if (!pointInPolygon(point, coordinates[0])) {
                    return false
                }
                for (let i = 1; i < coordinates.length; i++) {
                    if (pointInPolygon(point, coordinates[i])) {
                        return false
                    }
                }
                return true
            } else if (geometry.type === "MultiPolygon") {
                for (const polygon of geometry.coordinates) {
                    if (pointInPolygon(point, polygon[0])) {
                        let inHole = false
                        for (let i = 1; i < polygon.length; i++) {
                            if (pointInPolygon(point, polygon[i])) {
                                inHole = true
                                break
                            }
                        }
                        if (!inHole) {
                            return true
                        }
                    }
                }
                return false
            }

            return false
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const generateDotsInPolygon = (feature: any, dotSpacing = 16) => {
            const dots: [number, number][] = []
            const bounds = d3.geoBounds(feature)
            const [[minLng, minLat], [maxLng, maxLat]] = bounds

            const stepSize = dotSpacing * 0.08

            for (let lng = minLng; lng <= maxLng; lng += stepSize) {
                for (let lat = minLat; lat <= maxLat; lat += stepSize) {
                    const point: [number, number] = [lng, lat]
                    if (pointInFeature(point, feature)) {
                        dots.push(point)
                    }
                }
            }

            return dots
        }

        interface DotData {
            lng: number
            lat: number
            visible: boolean
        }

        const allDots: DotData[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let landFeatures: any

        const render = () => {
            context.clearRect(0, 0, containerWidth, containerHeight)

            const currentScale = projection.scale()
            const scaleFactor = currentScale / radius

            // Draw ocean (globe background)
            context.beginPath()
            context.arc(containerWidth / 2, containerHeight / 2, currentScale, 0, 2 * Math.PI)
            context.fillStyle = "#000000"
            context.fill()
            context.strokeStyle = "#ffffff"
            context.lineWidth = 2 * scaleFactor
            context.stroke()

            if (landFeatures) {
                // Draw graticule
                const graticule = d3.geoGraticule()
                context.beginPath()
                path(graticule())
                context.strokeStyle = "#ffffff"
                context.lineWidth = 1 * scaleFactor
                context.globalAlpha = 0.25
                context.stroke()
                context.globalAlpha = 1

                // Draw land outlines
                context.beginPath()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                landFeatures.features.forEach((feature: any) => {
                    path(feature)
                })
                context.strokeStyle = "#ffffff"
                context.lineWidth = 1 * scaleFactor
                context.stroke()

                // Draw halftone dots
                allDots.forEach((dot) => {
                    const projected = projection([dot.lng, dot.lat])
                    if (
                        projected &&
                        projected[0] >= 0 &&
                        projected[0] <= containerWidth &&
                        projected[1] >= 0 &&
                        projected[1] <= containerHeight
                    ) {
                        context.beginPath()
                        context.arc(projected[0], projected[1], 1.2 * scaleFactor, 0, 2 * Math.PI)
                        context.fillStyle = "#999999"
                        context.fill()
                    }
                })
            }
        }

        const loadWorldData = async () => {
            try {
                setIsLoading(true)

                const response = await fetch("/ne_110m_land.json")
                if (!response.ok) throw new Error("Failed to load land data")

                landFeatures = await response.json()

                // Show the globe immediately (ocean + graticule only) — no dot lag
                setIsLoading(false)
                render()

                // Generate dots progressively across animation frames so the main
                // thread is never blocked and the globe stays responsive.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const features: any[] = landFeatures.features
                let featureIndex = 0

                const processNextChunk = () => {
                    if (featureIndex >= features.length) return // done

                    // Process up to 3 features per frame (tunable)
                    const chunkEnd = Math.min(featureIndex + 3, features.length)
                    for (; featureIndex < chunkEnd; featureIndex++) {
                        // Slightly coarser spacing (18) = fewer dots = faster
                        const dots = generateDotsInPolygon(features[featureIndex], 18)
                        dots.forEach(([lng, lat]) => {
                            allDots.push({ lng, lat, visible: true })
                        })
                    }

                    // Re-render after each chunk so dots appear progressively
                    render()
                    requestAnimationFrame(processNextChunk)
                }

                requestAnimationFrame(processNextChunk)
            } catch {
                setError("Failed to load land map data")
                setIsLoading(false)
            }
        }

        // Set up rotation and interaction
        const rotation: [number, number] = [0, 0]
        let autoRotate = true
        const rotationSpeed = 0.5

        const rotate = () => {
            if (autoRotate) {
                rotation[0] += rotationSpeed
                projection.rotate(rotation)
                render()
            }
        }

        const rotationTimer = d3.timer(rotate)

        const handleMouseDown = (event: MouseEvent) => {
            autoRotate = false
            const startX = event.clientX
            const startY = event.clientY
            const startRotation: [number, number] = [rotation[0], rotation[1]]

            const handleMouseMove = (moveEvent: MouseEvent) => {
                const sensitivity = 0.5
                const dx = moveEvent.clientX - startX
                const dy = moveEvent.clientY - startY

                rotation[0] = startRotation[0] + dx * sensitivity
                rotation[1] = startRotation[1] - dy * sensitivity
                rotation[1] = Math.max(-90, Math.min(90, rotation[1]))

                projection.rotate(rotation)
                render()
            }

            const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove)
                document.removeEventListener("mouseup", handleMouseUp)
                setTimeout(() => {
                    autoRotate = true
                }, 10)
            }

            document.addEventListener("mousemove", handleMouseMove)
            document.addEventListener("mouseup", handleMouseUp)
        }

        const handleWheel = (event: WheelEvent) => {
            event.preventDefault()
            const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
            const newRadius = Math.max(radius * 0.5, Math.min(radius * 3, projection.scale() * scaleFactor))
            projection.scale(newRadius)
            render()
        }

        canvas.addEventListener("mousedown", handleMouseDown)
        canvas.addEventListener("wheel", handleWheel)

        loadWorldData()

        return () => {
            rotationTimer.stop()
            canvas.removeEventListener("mousedown", handleMouseDown)
            canvas.removeEventListener("wheel", handleWheel)
        }
    }, [width, height])

    return (
        <div className={`relative ${className}`}>
            {/* Canvas is ALWAYS rendered so canvasRef is never null in useEffect */}
            <canvas
                ref={canvasRef}
                className="w-full h-auto rounded-2xl"
                style={{
                    maxWidth: "100%", height: "auto", background: "transparent",
                    visibility: isLoading || error ? "hidden" : "visible"
                }}
            />

            {/* Loading overlay */}
            {isLoading && !error && (
                <div
                    className={`absolute inset-0 flex items-center justify-center rounded-2xl`}
                    style={{ minHeight: 400 }}
                >
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full border border-white/10 animate-pulse bg-white/5" />
                        <p className="text-xs text-slate-500">Loading globe…</p>
                    </div>
                </div>
            )}

            {/* Error overlay */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl p-8">
                    <div className="text-center">
                        <p className="text-red-400 font-semibold mb-2">Error loading Earth visualization</p>
                        <p className="text-slate-500 text-sm">{error}</p>
                    </div>
                </div>
            )}

            {/* Hint label */}
            {!isLoading && !error && (
                <div className="absolute bottom-4 left-4 text-xs text-slate-500 px-2 py-1 rounded-md bg-black/40 backdrop-blur-sm">
                    Drag to rotate • Scroll to zoom
                </div>
            )}
        </div>
    )
}
