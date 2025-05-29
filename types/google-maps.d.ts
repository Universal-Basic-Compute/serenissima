declare namespace google.maps {
  namespace drawing {
    class DrawingManager extends google.maps.MVCObject {
      constructor(options?: DrawingManagerOptions);
      getDrawingMode(): OverlayType;
      setDrawingMode(drawingMode: OverlayType | null): void;
      setMap(map: Map | null): void;
      setOptions(options: DrawingManagerOptions): void;
    }

    interface DrawingManagerOptions {
      circleOptions?: CircleOptions;
      drawingControl?: boolean;
      drawingControlOptions?: DrawingControlOptions;
      drawingMode?: OverlayType | null;
      map?: Map;
      markerOptions?: MarkerOptions;
      polygonOptions?: PolygonOptions;
      polylineOptions?: PolylineOptions;
      rectangleOptions?: RectangleOptions;
    }

    interface DrawingControlOptions {
      drawingModes?: OverlayType[];
      position?: ControlPosition;
    }

    enum OverlayType {
      CIRCLE = 'circle',
      MARKER = 'marker',
      POLYGON = 'polygon',
      POLYLINE = 'polyline',
      RECTANGLE = 'rectangle'
    }
  }
}
