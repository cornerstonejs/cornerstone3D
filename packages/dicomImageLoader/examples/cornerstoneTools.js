/*! cornerstoneTools - v0.6.2 - 2015-04-04 | (c) 2014 Chris Hafey | https://github.com/chafey/cornerstoneTools */
// Begin Source: src/inputSources/mouseWheelInput.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function mouseWheel(e)
    {
        // !!!HACK/NOTE/WARNING!!!
        // for some reason I am getting mousewheel and DOMMouseScroll events on my
        // mac os x mavericks system when middle mouse button dragging.
        // I couldn't find any info about this so this might break other systems
        // webkit hack
        if(e.originalEvent.type === "mousewheel" && e.originalEvent.wheelDeltaY === 0) {
            return;
        }
        // firefox hack
        if(e.originalEvent.type === "DOMMouseScroll" && e.originalEvent.axis ===1) {
            return;
        }

        var element = e.currentTarget;
        var startingCoords = cornerstone.pageToPixel(element, e.pageX, e.pageY);

        e = window.event || e; // old IE support
        var wheelDelta = e.wheelDelta || -e.detail || -e.originalEvent.detail;
        var direction = Math.max(-1, Math.min(1, (wheelDelta)));

        var mouseWheelData = {
            element: element,
            viewport: cornerstone.getViewport(element),
            image: cornerstone.getEnabledElement(element).image,
            direction : direction,
            pageX : e.pageX,
            pageY: e.pageY,
            imageX : startingCoords.x,
            imageY : startingCoords.y
        };

        $(element).trigger("CornerstoneToolsMouseWheel", mouseWheelData);
    }


    var mouseWheelEvents = "mousewheel DOMMouseScroll";

    function enable(element)
    {
        $(element).on(mouseWheelEvents, mouseWheel);
    }

    function disable(element) {
        $(element).unbind(mouseWheelEvents, mouseWheel);
    }

    // module exports
    cornerstoneTools.mouseWheelInput = {
        enable : enable,
        disable : disable
    };

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/inputSources/mouseWheelInput.js

// Begin Source: src/inputSources/mouseInput.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function activateMouseDown(mouseEventDetail)
    {
        $(mouseEventDetail.element).trigger("CornerstoneToolsMouseDownActivate", mouseEventDetail);
    }


    function mouseDown(e) {
        var eventData = e.data;
        var element = e.currentTarget;

        var startPoints = {
            page: cornerstoneMath.point.pageToPoint(e),
            image: cornerstone.pageToPixel(element, e.pageX, e.pageY)
        };
        var lastPoints = cornerstoneTools.copyPoints(startPoints);
        var mouseEventDetail = {
                event: e,
                which: e.which,
                viewport: cornerstone.getViewport(element),
                image: cornerstone.getEnabledElement(element).image,
                element: element,
                startPoints: startPoints,
                lastPoints: lastPoints,
                currentPoints: startPoints,
                deltaPoints: {x: 0, y:0}
            };

        var event = jQuery.Event( "CornerstoneToolsMouseDown", mouseEventDetail);
        $(mouseEventDetail.element).trigger(event, mouseEventDetail);
        if(event.isImmediatePropagationStopped() === false)
        //if(element.dispatchEvent(event) === true)
        {
            // no tools responded to this event, give the active tool a chance
            if(activateMouseDown(mouseEventDetail) === true)
            {
                return cornerstoneTools.pauseEvent(e);
            }
        }

        var whichMouseButton = e.which;

        function onMouseMove(e) {
            // calculate our current points in page and image coordinates
            var currentPoints = {
                page: cornerstoneMath.point.pageToPoint(e),
                image: cornerstone.pageToPixel(element, e.pageX, e.pageY)
            };

            // Calculate delta values in page and image coordinates
            var deltaPoints = {
                page: cornerstoneMath.point.subtract(currentPoints.page, lastPoints.page),
                image: cornerstoneMath.point.subtract(currentPoints.image, lastPoints.image)
            };

            var eventData = {
                which: whichMouseButton,
                viewport: cornerstone.getViewport(element),
                image: cornerstone.getEnabledElement(element).image,
                element: element,
                startPoints: startPoints,
                lastPoints: lastPoints,
                currentPoints: currentPoints,
                deltaPoints: deltaPoints
             };

            //element.dispatchEvent(event);

            $(mouseEventDetail.element).trigger("CornerstoneToolsMouseDrag", eventData);


            // update the last points
            lastPoints = cornerstoneTools.copyPoints(currentPoints);

            // prevent left click selection of DOM elements
            return cornerstoneTools.pauseEvent(e);
        }

        // hook mouseup so we can unbind our event listeners
        // when they stop dragging
        function onMouseUp(e) {

            // calculate our current points in page and image coordinates
            var currentPoints = {
                page: cornerstoneMath.point.pageToPoint(e),
                image: cornerstone.pageToPixel(element, e.pageX, e.pageY)
            };

            // Calculate delta values in page and image coordinates
            var deltaPoints = {
                page: cornerstoneMath.point.subtract(currentPoints.page, lastPoints.page),
                image: cornerstoneMath.point.subtract(currentPoints.image, lastPoints.image)
            };

            var eventData = {
                event: e,
                which: whichMouseButton,
                viewport: cornerstone.getViewport(element),
                image: cornerstone.getEnabledElement(element).image,
                element: element,
                startPoints: startPoints,
                lastPoints: lastPoints,
                currentPoints: currentPoints,
                deltaPoints: deltaPoints
            };
            //element.dispatchEvent(event);

            var event = jQuery.Event("CornerstoneToolsMouseUp", eventData);
            $(mouseEventDetail.element).trigger(event, eventData);

            $(document).off('mousemove', onMouseMove);
            $(document).off('mouseup', onMouseUp);
        }

        $(document).on("mousemove", onMouseMove);
        $(document).on("mouseup", onMouseUp);


        return cornerstoneTools.pauseEvent(e);
    }

    function mouseMove(e) {
        var eventData = e.data;
        var element = e.currentTarget;

        var startPoints = {
            page: cornerstoneMath.point.pageToPoint(e),
            image: cornerstone.pageToPixel(element, e.pageX, e.pageY)
        };
        var lastPoints = cornerstoneTools.copyPoints(startPoints);

        var whichMouseButton = e.which;


        // calculate our current points in page and image coordinates
        var currentPoints = {
            page: cornerstoneMath.point.pageToPoint(e),
            image: cornerstone.pageToPixel(element, e.pageX, e.pageY)
        };

        // Calculate delta values in page and image coordinates
        var deltaPoints = {
            page: cornerstoneMath.point.subtract(currentPoints.page, lastPoints.page),
            image: cornerstoneMath.point.subtract(currentPoints.image, lastPoints.image)
        };

        var mouseMoveEventData = {
            which: whichMouseButton,
            viewport: cornerstone.getViewport(element),
            image: cornerstone.getEnabledElement(element).image,
            element: element,
            startPoints: startPoints,
            lastPoints: lastPoints,
            currentPoints: currentPoints,
            deltaPoints: deltaPoints
        };
        //element.dispatchEvent(event);
        $(element).trigger("CornerstoneToolsMouseMove", mouseMoveEventData);

        // update the last points
        lastPoints = cornerstoneTools.copyPoints(currentPoints);

        // prevent left click selection of DOM elements
        //return cornerstoneTools.pauseEvent(e);
    }

    function enable(element)
    {
        $(element).on("mousedown", mouseDown);
        $(element).on("mousemove", mouseMove);
    }

    function disable(element) {
        $(element).off("mousedown", mouseDown);
        $(element).off("mousemove", mouseMove);
    }

    // module exports
    cornerstoneTools.mouseInput = {
        enable : enable,
        disable : disable
    };

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/inputSources/mouseInput.js

// Begin Source: src/imageTools/simpleMouseButtonTool.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function simpleMouseButtonTool(mouseDownCallback)
    {
        var toolInterface = {
            activate: function(element, mouseButtonMask, options) {
                $(element).off('CornerstoneToolsMouseDownActivate', mouseDownCallback);
                var eventData = {
                    mouseButtonMask: mouseButtonMask,
                    options: options
                };
                $(element).on("CornerstoneToolsMouseDownActivate", eventData, mouseDownCallback);
            },
            disable : function(element) {$(element).off('CornerstoneToolsMouseDownActivate', mouseDownCallback);},
            enable : function(element) {$(element).off('CornerstoneToolsMouseDownActivate', mouseDownCallback);},
            deactivate : function(element) {$(element).off('CornerstoneToolsMouseDownActivate', mouseDownCallback);},
        };
        return toolInterface;
    }

    // module exports
    cornerstoneTools.simpleMouseButtonTool = simpleMouseButtonTool;
    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/imageTools/simpleMouseButtonTool.js

// Begin Source: src/imageTools/mouseButtonTool.js
var coordsData;
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

/*
    mouseToolInterface = {
        createNewMeasurement : function() {},
        onImageRendered: function() {},
        toolType : "probe",
    };

 */

    function mouseButtonTool(mouseToolInterface)
    {
        ///////// BEGIN ACTIVE TOOL ///////
        function addNewMeasurement(mouseEventData)
        {
            var measurementData = mouseToolInterface.createNewMeasurement(mouseEventData);

            // associate this data with this imageId so we can render it and manipulate it
            cornerstoneTools.addToolState(mouseEventData.element, mouseToolInterface.toolType, measurementData);
           

            // since we are dragging to another place to drop the end point, we can just activate
            // the end point and let the moveHandle move it for us.
            $(mouseEventData.element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
            cornerstoneTools.moveHandle(mouseEventData, measurementData.handles.end, function() {
                if(cornerstoneTools.anyHandlesOutsideImage(mouseEventData, measurementData.handles))
                {
                    // delete the measurement
                    cornerstoneTools.removeToolState(mouseEventData.element, mouseToolInterface.toolType, measurementData);
                }
                $(mouseEventData.element).on('CornerstoneToolsMouseMove', mouseMoveCallback);
            });
        }

        function mouseDownActivateCallback(e, eventData) {
            if (cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {
                addNewMeasurement(eventData);
                return false; // false = cases jquery to preventDefault() and stopPropagation() this event
            }
        }
        ///////// END ACTIVE TOOL ///////

        ///////// BEGIN DEACTIVE TOOL ///////

        function mouseMoveCallback(e, eventData)
        {  
             cornerstoneTools.activeToolcoordinate.setCoords(eventData);
            // if a mouse button is down, do nothing
            if(eventData.which !== 0) {
                return;
            }
          
            
            // if we have no tool data for this element, do nothing
            var toolData = cornerstoneTools.getToolState(eventData.element, mouseToolInterface.toolType);
            if(toolData === undefined) {
                return;
            }
            
            // We have tool data, search through all data
            // and see if we can activate a handle
            var imageNeedsUpdate = false;
            for(var i=0; i < toolData.data.length; i++) {
                // get the cursor position in image coordinates
                var data = toolData.data[i];
                if(cornerstoneTools.handleActivator(data.handles, eventData.currentPoints.image, eventData.viewport.scale ) === true)
                {
                    imageNeedsUpdate = true;
                }
            }

            // Handle activation status changed, redraw the image
            if(imageNeedsUpdate === true) {
                cornerstone.updateImage(eventData.element);
            }
        }

        function getHandleNearImagePoint(data, coords)
        {
            for(var handle in data.handles) {
                var distanceSquared = cornerstoneMath.point.distanceSquared(data.handles[handle], coords);
                if(distanceSquared < 25)
                {
                    return data.handles[handle];
                }
            }
        }

        function mouseDownCallback(e, eventData) {
            var data;

            function handleDoneMove()
            {
                if(cornerstoneTools.anyHandlesOutsideImage(eventData, data.handles))
                {
                    // delete the measurement
                    cornerstoneTools.removeToolState(eventData.element, mouseToolInterface.toolType, data);
                }
                $(eventData.element).on('CornerstoneToolsMouseMove', mouseMoveCallback);
            }

            if(cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {
                var coords = eventData.startPoints.image;
                var toolData = cornerstoneTools.getToolState(e.currentTarget, mouseToolInterface.toolType);

                var i;

                // now check to see if there is a handle we can move
                if(toolData !== undefined) {
                    for(i=0; i < toolData.data.length; i++) {
                        data = toolData.data[i];
                        var handle = getHandleNearImagePoint(data, coords);
                        if(handle !== undefined) {
                            $(eventData.element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
                            cornerstoneTools.moveHandle(eventData, handle, handleDoneMove);
                            e.stopImmediatePropagation();
                            return false;
                        }
                    }
                }

                // Now check to see if there is a line we can move
                // now check to see if we have a tool that we can move
                if(toolData !== undefined && mouseToolInterface.pointNearTool !== undefined) {
                    for(i=0; i < toolData.data.length; i++) {
                        data = toolData.data[i];
                        if(mouseToolInterface.pointNearTool(data, coords)) {
                            $(eventData.element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
                            cornerstoneTools.moveAllHandles(e, data, toolData, true);
                            e.stopImmediatePropagation();
                            return false;
                        }
                    }
                }
            }
        }
        ///////// END DEACTIVE TOOL ///////



        // not visible, not interactive
        function disable(element)
        {
            $(element).off("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
            $(element).off('CornerstoneToolsMouseDown', mouseDownCallback);
            $(element).off('CornerstoneToolsMouseDownActivate', mouseDownActivateCallback);

            cornerstone.updateImage(element);
        }

        // visible but not interactive
        function enable(element)
        {
            $(element).off("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
            $(element).off('CornerstoneToolsMouseDown', mouseDownCallback);
            $(element).off('CornerstoneToolsMouseDownActivate', mouseDownActivateCallback);

            $(element).on("CornerstoneImageRendered", mouseToolInterface.onImageRendered);

            cornerstone.updateImage(element);
        }

        // visible, interactive and can create
        function activate(element, mouseButtonMask) {
            var eventData = {
                mouseButtonMask: mouseButtonMask,
            };

            $(element).off("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).off("CornerstoneToolsMouseMove", mouseMoveCallback);
            $(element).off("CornerstoneToolsMouseDown", mouseDownCallback);
            $(element).off('CornerstoneToolsMouseDownActivate', mouseDownActivateCallback);

            $(element).on("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).on("CornerstoneToolsMouseMove", eventData, mouseMoveCallback);
            $(element).on('CornerstoneToolsMouseDown', eventData, mouseDownCallback);
            $(element).on('CornerstoneToolsMouseDownActivate', eventData, mouseDownActivateCallback);

            cornerstone.updateImage(element);
        }

        // visible, interactive
        function deactivate(element, mouseButtonMask) {
            var eventData = {
                mouseButtonMask: mouseButtonMask,
            };

            $(element).off("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).off("CornerstoneToolsMouseMove", mouseMoveCallback);
            $(element).off("CornerstoneToolsMouseDown", mouseDownCallback);
            $(element).off('CornerstoneToolsMouseDownActivate', mouseDownActivateCallback);

            $(element).on("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).on("CornerstoneToolsMouseMove", eventData, mouseMoveCallback);
            $(element).on('CornerstoneToolsMouseDown', eventData, mouseDownCallback);

            cornerstone.updateImage(element);
        }

        var toolInterface = {
            enable: enable,
            disable : disable,
            activate: activate,
            deactivate: deactivate
        };

        return toolInterface;
    }

    // module exports
    cornerstoneTools.mouseButtonTool = mouseButtonTool;

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/imageTools/mouseButtonTool.js

// Begin Source: src/imageTools/mouseButtonRectangleTool.js
var coordsData;
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

/*
    mouseToolInterface = {
        createNewMeasurement : function() {},
        onImageRendered: function() {},
        toolType : "probe",
    };

 */

    function mouseButtonRectangleTool(mouseToolInterface, preventHandleOutsideImage)
    {
        ///////// BEGIN ACTIVE TOOL ///////
        function addNewMeasurement(mouseEventData)
        {
            var measurementData = mouseToolInterface.createNewMeasurement(mouseEventData);

            // associate this data with this imageId so we can render it and manipulate it
            cornerstoneTools.addToolState(mouseEventData.element, mouseToolInterface.toolType, measurementData);
           

            // since we are dragging to another place to drop the end point, we can just activate
            // the end point and let the moveHandle move it for us.
            $(mouseEventData.element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
            cornerstoneTools.moveHandle(mouseEventData, measurementData.handles.end, function() {
                if(cornerstoneTools.anyHandlesOutsideImage(mouseEventData, measurementData.handles))
                {
                    // delete the measurement
                    cornerstoneTools.removeToolState(mouseEventData.element, mouseToolInterface.toolType, measurementData);
                }
                $(mouseEventData.element).on('CornerstoneToolsMouseMove', mouseMoveCallback);
            }, preventHandleOutsideImage);
        }

        function mouseDownActivateCallback(e, eventData) {
            if (cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {
                addNewMeasurement(eventData);
                return false; // false = cases jquery to preventDefault() and stopPropagation() this event
            }
        }
        ///////// END ACTIVE TOOL ///////

        ///////// BEGIN DEACTIVE TOOL ///////

        function mouseMoveCallback(e, eventData)
        {
             cornerstoneTools.activeToolcoordinate.setCoords(eventData);
            // if a mouse button is down, do nothing
            if(eventData.which !== 0) {
                return;
            }
          
            
            // if we have no tool data for this element, do nothing
            var toolData = cornerstoneTools.getToolState(eventData.element, mouseToolInterface.toolType);
            if(toolData === undefined) {
                return;
            }
            
            // We have tool data, search through all data
            // and see if we can activate a handle
            var imageNeedsUpdate = false;
            for(var i=0; i < toolData.data.length; i++) {
                // get the cursor position in image coordinates
                var data = toolData.data[i];
                if(cornerstoneTools.handleActivator(data.handles, eventData.currentPoints.image, eventData.viewport.scale ) === true)
                {
                    imageNeedsUpdate = true;
                }
            }

            // Handle activation status changed, redraw the image
            if(imageNeedsUpdate === true) {
                cornerstone.updateImage(eventData.element);
            }
        }

        function getHandleNearImagePoint(data, coords)
        {
            for(var handle in data.handles) {
                var distanceSquared = cornerstoneMath.point.distanceSquared(data.handles[handle], coords);
                if(distanceSquared < 25)
                {
                    return data.handles[handle];
                }
            }
        }

        function mouseDownCallback(e, eventData) {
            var data;

            function handleDoneMove()
            {
                if(cornerstoneTools.anyHandlesOutsideImage(eventData, data.handles))
                {
                    // delete the measurement
                    cornerstoneTools.removeToolState(eventData.element, mouseToolInterface.toolType, data);
                }
                $(eventData.element).on('CornerstoneToolsMouseMove', mouseMoveCallback);
            }

            if(cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {
                var coords = eventData.startPoints.image;
                var toolData = cornerstoneTools.getToolState(e.currentTarget, mouseToolInterface.toolType);

                var i;

                // now check to see if there is a handle we can move
                if(toolData !== undefined) {
                    for(i=0; i < toolData.data.length; i++) {
                        data = toolData.data[i];
                        var handle = getHandleNearImagePoint(data, coords);
                        if(handle !== undefined) {
                            $(eventData.element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
                            cornerstoneTools.moveHandle(eventData, handle, handleDoneMove, preventHandleOutsideImage);
                            e.stopImmediatePropagation();
                            return false;
                        }
                    }
                }

                // Now check to see if there is a line we can move
                // now check to see if we have a tool that we can move
                if(toolData !== undefined && mouseToolInterface.pointInsideRect !== undefined) {
                    for(i=0; i < toolData.data.length; i++) {
                        data = toolData.data[i];
                        if(mouseToolInterface.pointInsideRect(data, coords)) {
                            $(eventData.element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
                            cornerstoneTools.moveAllHandles(e, data, toolData, false, preventHandleOutsideImage);
                            e.stopImmediatePropagation();
                            return false;
                        }
                    }
                }
            }
        }
        ///////// END DEACTIVE TOOL ///////



        // not visible, not interactive
        function disable(element)
        {
            $(element).off("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
            $(element).off('CornerstoneToolsMouseDown', mouseDownCallback);
            $(element).off('CornerstoneToolsMouseDownActivate', mouseDownActivateCallback);

            cornerstone.updateImage(element);
        }

        // visible but not interactive
        function enable(element)
        {
            $(element).off("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
            $(element).off('CornerstoneToolsMouseDown', mouseDownCallback);
            $(element).off('CornerstoneToolsMouseDownActivate', mouseDownActivateCallback);

            $(element).on("CornerstoneImageRendered", mouseToolInterface.onImageRendered);

            cornerstone.updateImage(element);
        }

        // visible, interactive and can create
        function activate(element, mouseButtonMask) {
            var eventData = {
                mouseButtonMask: mouseButtonMask,
            };

            $(element).off("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).off("CornerstoneToolsMouseMove", mouseMoveCallback);
            $(element).off("CornerstoneToolsMouseDown", mouseDownCallback);
            $(element).off('CornerstoneToolsMouseDownActivate', mouseDownActivateCallback);

            $(element).on("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).on("CornerstoneToolsMouseMove", eventData, mouseMoveCallback);
            $(element).on('CornerstoneToolsMouseDown', eventData, mouseDownCallback);
            $(element).on('CornerstoneToolsMouseDownActivate', eventData, mouseDownActivateCallback);

            cornerstone.updateImage(element);
        }

        // visible, interactive
        function deactivate(element, mouseButtonMask) {
            var eventData = {
                mouseButtonMask: mouseButtonMask,
            };

            $(element).off("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).off("CornerstoneToolsMouseMove", mouseMoveCallback);
            $(element).off("CornerstoneToolsMouseDown", mouseDownCallback);
            $(element).off('CornerstoneToolsMouseDownActivate', mouseDownActivateCallback);

            $(element).on("CornerstoneImageRendered", mouseToolInterface.onImageRendered);
            $(element).on("CornerstoneToolsMouseMove", eventData, mouseMoveCallback);
            $(element).on('CornerstoneToolsMouseDown', eventData, mouseDownCallback);

            cornerstone.updateImage(element);
        }

        var toolInterface = {
            enable: enable,
            disable : disable,
            activate: activate,
            deactivate: deactivate
        };

        return toolInterface;
    }

    // module exports
    cornerstoneTools.mouseButtonRectangleTool = mouseButtonRectangleTool;

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/imageTools/mouseButtonRectangleTool.js

// Begin Source: src/imageTools/mouseWheelTool.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function mouseWheelTool(mouseWheelCallback)
    {
        var toolInterface = {
            activate: function(element) {
                $(element).off('CornerstoneToolsMouseWheel', mouseWheelCallback);
                var eventData = {
                };
                $(element).on("CornerstoneToolsMouseWheel", eventData, mouseWheelCallback);
            },
            disable : function(element) {$(element).off('CornerstoneToolsMouseWheel', mouseWheelCallback);},
            enable : function(element) {$(element).off('CornerstoneToolsMouseWheel', mouseWheelCallback);},
            deactivate : function(element) {$(element).off('CornerstoneToolsMouseWheel', mouseWheelCallback);}
        };
        return toolInterface;
    }

    // module exports
    cornerstoneTools.mouseWheelTool = mouseWheelTool;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/imageTools/mouseWheelTool.js

// Begin Source: src/imageTools/touchDragTool.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    /*jshint newcap: false */

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }


    function touchDragTool(touchDragCallback)
    {
        var toolInterface = {
            activate: function(element, mouseButtonMask) {
                $(element).off('CornerstoneToolsTouchDrag', touchDragCallback);
                var eventData = {
                };
                $(element).on("CornerstoneToolsTouchDrag", eventData, touchDragCallback);
            },
            disable : function(element) {$(element).off('CornerstoneToolsTouchDrag', touchDragCallback);},
            enable : function(element) {$(element).off('CornerstoneToolsTouchDrag', touchDragCallback);},
            deactivate : function(element) {$(element).off('CornerstoneToolsTouchDrag', touchDragCallback);}
        };
        return toolInterface;
    }

    // module exports
    cornerstoneTools.touchDragTool = touchDragTool;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/imageTools/touchDragTool.js

// Begin Source: src/imageTools/touchPinchTool.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    /*jshint newcap: false */

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }


    function touchPinchTool(touchPinchCallback)
    {
        var toolInterface = {
            activate: function(element) {
                $(element).off('CornerstoneToolsTouchPinch', touchPinchCallback);
                var eventData = {
                };
                $(element).on("CornerstoneToolsTouchPinch", eventData, touchPinchCallback);
            },
            disable : function(element) {$(element).off('CornerstoneToolsTouchPinch', touchPinchCallback);},
            enable : function(element) {$(element).off('CornerstoneToolsTouchPinch', touchPinchCallback);},
            deactivate : function(element) {$(element).off('CornerstoneToolsTouchPinch', touchPinchCallback);}
        };
        return toolInterface;
    }

    // module exports
    cornerstoneTools.touchPinchTool = touchPinchTool;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/imageTools/touchPinchTool.js

// Begin Source: src/imageTools/touchTool.js
// Begin Source: src/imageTools/touchTool.js

//var coordsData, colourChanger = "greenyellow";
var cornerstoneTools = (function($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if (cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function touchTool(touchToolInterface)
    {
        ///////// BEGIN ACTIVE TOOL ///////
        function addNewMeasurement(touchEventData)
        {
            var measurementData = touchToolInterface.createNewMeasurement(touchEventData);
            cornerstoneTools.addToolState(touchEventData.element, touchToolInterface.toolType, measurementData);
            $(touchEventData.element).off('CornerstoneToolsTouchDrag', touchMoveCallback);
            cornerstoneTools.moveHandle(touchEventData, measurementData.handles.end, function() {
                if (cornerstoneTools.anyHandlesOutsideImage(touchEventData, measurementData.handles))
                {
                    // delete the measurement
                    cornerstoneTools.removeToolState(mouseEventData.element, mouseToolInterface.toolType, measurementData);
                }
                $(touchEventData.element).on('CornerstoneToolsTouchDrag', touchMoveCallback);
            });
        }

        function touchDownActivateCallback(e, eventData) {
           
            addNewMeasurement(eventData);
            return false; // false = cases jquery to preventDefault() and stopPropagation() this event
        }
        ///////// END ACTIVE TOOL ///////

        ///////// BEGIN DEACTIVE TOOL ///////

        function touchMoveCallback(e, eventData)
        {
           
            cornerstoneTools.activeToolcoordinate.setCoords(eventData);
      
            // if we have no tool data for this element, do nothing
            var toolData = cornerstoneTools.getToolState(eventData.element, touchToolInterface.toolType);
            if (toolData === undefined) {
                return;
            }

            // We have tool data, search through all data
            // and see if we can activate a handle
            var imageNeedsUpdate = false;
            for (var i = 0; i < toolData.data.length; i++) {
                // get the touch position in image coordinates
                var data = toolData.data[i];
                if (cornerstoneTools.handleActivator(data.handles, eventData.currentPoints.image, eventData.viewport.scale) === true)
                {
                    imageNeedsUpdate = true;
                }
            }

            // Handle activation status changed, redraw the image
            if (imageNeedsUpdate === true) {
                cornerstone.updateImage(eventData.element);
            }
        }

        function getHandleNearImagePoint(data, coords)
        {
            for (var handle in data.handles) {
                var distanceSquared = cornerstoneMath.point.distanceSquared(data.handles[handle], coords);
                if (distanceSquared < 30)
                {
                    return data.handles[handle];
                }
            }
        }

        function touchstartCallback(e, eventData){
            var data;
            function handleDoneMove()
            {
                if (cornerstoneTools.anyHandlesOutsideImage(eventData, data.handles))
                {
                    // delete the measurement
                    cornerstoneTools.removeToolState(eventData.element, touchToolInterface.toolType, data);
                }
                $(eventData.element).on('CornerstoneToolsTouchDrag', touchMoveCallback);
            }

            var coords = eventData.startPoints.image;
            var toolData = cornerstoneTools.getToolState(e.currentTarget, touchToolInterface.toolType);
            var i;

            // now check to see if there is a handle we can move
            if (toolData !== undefined) {
                for (i = 0; i < toolData.data.length; i++) {
                    data = toolData.data[i];
                    var handle = getHandleNearImagePoint(data, coords);
                    if (handle !== undefined) {
                        $(eventData.element).off('CornerstoneToolsTouchDrag', touchMoveCallback);
                        cornerstoneTools.touchmoveHandle(eventData, handle, handleDoneMove);
                         e.stopImmediatePropagation();
                        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
                    }
                }
            }

            // Now check to see if there is a line we can move
            // now check to see if we have a tool that we can move
            if (toolData !== undefined && touchToolInterface.pointNearTool !== undefined) {
                for (i = 0; i < toolData.data.length; i++) {
                    data = toolData.data[i];
                    if (touchToolInterface.pointNearTool(data, coords)) {
                        $(eventData.element).off('CornerstoneToolsTouchDrag', touchMoveCallback);
                        cornerstoneTools.touchmoveAllHandles(e, data, toolData, true);
                         e.stopImmediatePropagation();
                        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
                    }
                }
            }
//            }
        }
        ///////// END DEACTIVE TOOL ///////



        // not visible, not interactive
        function disable(element)
        {
            $(element).off("CornerstoneImageRendered", touchToolInterface.onImageRendered);
            $(element).off('CornerstoneToolsTouchDrag', touchMoveCallback);
            $(element).off('CornerstoneToolsDragStart', touchstartCallback);
            $(element).off('CornerstoneToolsDragStartActive', touchDownActivateCallback);

            cornerstone.updateImage(element);
        }

        // visible but not interactive
        function enable(element)
        {
            $(element).off("CornerstoneImageRendered", touchToolInterface.onImageRendered);
            $(element).off('CornerstoneToolsTouchDrag', touchMoveCallback);
            $(element).off('CornerstoneToolsDragStart', touchstartCallback);
            $(element).off('CornerstoneToolsDragStartActive', touchDownActivateCallback);

            $(element).on("CornerstoneImageRendered", touchToolInterface.onImageRendered);

            cornerstone.updateImage(element);
        }

        // visible, interactive and can create
        function activate(element) {

            $(element).off("CornerstoneImageRendered", touchToolInterface.onImageRendered);
            $(element).off("CornerstoneToolsTouchDrag", touchMoveCallback);
            $(element).off("CornerstoneToolsDragStart", touchstartCallback);
            $(element).off('CornerstoneToolsDragStartActive', touchDownActivateCallback);

            $(element).on("CornerstoneImageRendered", touchToolInterface.onImageRendered);
            $(element).on("CornerstoneToolsTouchDrag", touchMoveCallback);
            $(element).on('CornerstoneToolsDragStart', touchstartCallback);
            $(element).on('CornerstoneToolsDragStartActive', touchDownActivateCallback);

            cornerstone.updateImage(element);
        }

        // visible, interactive
        function deactivate(element) {
           

            $(element).off("CornerstoneImageRendered", touchToolInterface.onImageRendered);
            $(element).off('CornerstoneToolsTouchDrag', touchMoveCallback);
            $(element).off('CornerstoneToolsDragStart', touchstartCallback);
            $(element).off('CornerstoneToolsDragStartActive', touchDownActivateCallback);

            $(element).on("CornerstoneImageRendered", touchToolInterface.onImageRendered);
            $(element).on("CornerstoneToolsTouchDrag",  touchMoveCallback);
            $(element).on('CornerstoneToolsDragStart',  touchstartCallback);

            cornerstone.updateImage(element);
        }

        var toolInterface = {
            enable: enable,
            disable: disable,
            activate: activate,
            deactivate: deactivate
        };

        return toolInterface;
    }

    // module exports
    cornerstoneTools.touchTool = touchTool;

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));





 
// End Source; src/imageTools/touchTool.js

// Begin Source: src/imageTools/AngleTool.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if (cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "angle";

    ///////// BEGIN ACTIVE TOOL ///////
    function createNewMeasurement(mouseEventData) {
        // create the measurement data for this tool with the end handle activated
        var angleData = {
            visible: true,
            handles: {
                start: {
                    x: mouseEventData.currentPoints.image.x - 20,
                    y: mouseEventData.currentPoints.image.y + 10,
                    highlight: true,
                    active: false
                },
                end: {
                    x: mouseEventData.currentPoints.image.x,
                    y: mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: true
                },
                start2: {
                    x: mouseEventData.currentPoints.image.x - 20,
                    y: mouseEventData.currentPoints.image.y + 10,
                    highlight: true,
                    active: false
                },
                end2: {
                    x: mouseEventData.currentPoints.image.x,
                    y: mouseEventData.currentPoints.image.y + 20,
                    highlight: true,
                    active: false
                }
            }
        };

        return angleData;
    }
    ///////// END ACTIVE TOOL ///////

    function pointNearTool(data, coords) {

        var lineSegment = {
            start: data.handles.start,
            end: data.handles.end
        };
        var distanceToPoint = cornerstoneMath.lineSegment.distanceToPoint(lineSegment, coords);
        if (distanceToPoint < 5)
            return true;

        lineSegment.start = data.handles.start2;
        lineSegment.end = data.handles.end2;

        distanceToPoint = cornerstoneMath.lineSegment.distanceToPoint(lineSegment, coords);
        return (distanceToPoint < 5);
    }

    ///////// BEGIN IMAGE RENDERING ///////
    function onImageRendered(e, eventData) {

        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if (toolData === undefined) {
            return;
        }

        // we have tool data for this element - iterate over each one and draw it
        var context = eventData.canvasContext.canvas.getContext("2d");
        cornerstone.setToPixelCoordinateSystem(eventData.enabledElement, context);
        //activation color 
        var color=cornerstoneTools.activeToolcoordinate.getToolColor();
        for (var i = 0; i < toolData.data.length; i++) {
            context.save();
            var data = toolData.data[i];
           //diffrentiate the color of activation tool
             if (pointNearTool(data,cornerstoneTools.activeToolcoordinate.getCoords())) {
               color=cornerstoneTools.activeToolcoordinate.getActiveColor();
            } else {
               color=cornerstoneTools.activeToolcoordinate.getToolColor();
            }

            // draw the line
            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = 1 / eventData.viewport.scale;
            context.moveTo(data.handles.start.x, data.handles.start.y);
            context.lineTo(data.handles.end.x, data.handles.end.y);
            context.moveTo(data.handles.start2.x, data.handles.start2.y);
            context.lineTo(data.handles.end2.x, data.handles.end2.y);
            context.stroke();

            // draw the handles
            context.beginPath();
            cornerstoneTools.drawHandles(context, eventData, data.handles);
            context.stroke();

            // Draw the text
            context.fillStyle = color;

            // Need to work on correct angle to measure.  This is a cobb angle and we need to determine
            // where lines cross to measure angle. For now it will show smallest angle. 
            var dx1 = (Math.ceil(data.handles.start.x) - Math.ceil(data.handles.end.x)) * eventData.image.columnPixelSpacing;
            var dy1 = (Math.ceil(data.handles.start.y) - Math.ceil(data.handles.end.y)) * eventData.image.rowPixelSpacing;
            var dx2 = (Math.ceil(data.handles.start2.x) - Math.ceil(data.handles.end2.x)) * eventData.image.columnPixelSpacing;
            var dy2 = (Math.ceil(data.handles.start2.y) - Math.ceil(data.handles.end2.y)) * eventData.image.rowPixelSpacing;

            var angle = Math.acos(Math.abs(((dx1 * dx2) + (dy1 * dy2)) / (Math.sqrt((dx1 * dx1) + (dy1 * dy1)) * Math.sqrt((dx2 * dx2) + (dy2 * dy2)))));
            angle = angle * (180 / Math.PI);

            var rAngle = cornerstoneTools.roundToDecimal(angle, 2);
            var str = "00B0"; // degrees symbol
            var text = rAngle.toString() + String.fromCharCode(parseInt(str, 16));

            var fontParameters = cornerstoneTools.setContextToDisplayFontSize(eventData.enabledElement, eventData.canvasContext, 15);
            context.font = "" + fontParameters.fontSize + "px Arial";

            var textX = (data.handles.start2.x + data.handles.end2.x) / 2 / fontParameters.fontScale;
            var textY = (data.handles.start2.y + data.handles.end2.y) / 2 / fontParameters.fontScale;
            context.fillText(text, textX, textY);
            context.restore();
        }

    }
    ///////// END IMAGE RENDERING ///////


    // module exports
    cornerstoneTools.angle = cornerstoneTools.mouseButtonTool({
        createNewMeasurement: createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool: pointNearTool,
        toolType: toolType
    });
     cornerstoneTools.angleTouch = cornerstoneTools.touchTool({
        createNewMeasurement: createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool: pointNearTool,
        toolType: toolType
    });

    return cornerstoneTools;
} ($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/imageTools/AngleTool.js

// Begin Source: src/imageTools/ellipticalRoi.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "ellipticalRoi";

    ///////// BEGIN ACTIVE TOOL ///////
    function createNewMeasurement(mouseEventData)
    {
        // create the measurement data for this tool with the end handle activated
        var measurementData = {
            visible : true,
            handles : {
                start : {
                    x : mouseEventData.currentPoints.image.x,
                    y : mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: false
                },
                end: {
                    x : mouseEventData.currentPoints.image.x,
                    y : mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: true
                }
            }
        };

        return measurementData;
    }
    ///////// END ACTIVE TOOL ///////

    function pointNearTool(data, coords)
    {
        // TODO: Find a formula for shortest distance betwen point and ellipse.  Rectangle is close enough
        var rect = {
            left : Math.min(data.handles.start.x, data.handles.end.x),
            top : Math.min(data.handles.start.y, data.handles.end.y),
            width : Math.abs(data.handles.start.x - data.handles.end.x),
            height : Math.abs(data.handles.start.y - data.handles.end.y)
        };

        var distanceToPoint = cornerstoneMath.rect.distanceToPoint(rect, coords);
        return (distanceToPoint < 5);
    }

    ///////// BEGIN IMAGE RENDERING ///////
    function pointInEllipse(ellipse, location)
    {
        var xRadius = ellipse.width / 2;
        var yRadius = ellipse.height / 2;

        if (xRadius <= 0.0 || yRadius <= 0.0)
        {
            return false;
        }

        var center = {
            x: ellipse.left + xRadius,
            y: ellipse.top + yRadius
        };

        /* This is a more general form of the circle equation
         *
         * X^2/a^2 + Y^2/b^2 <= 1
         */

        var normalized = {
            x: location.x - center.x,
            y: location.y - center.y
        };

        var inEllipse = ((normalized.x * normalized.y) / (xRadius * xRadius)) + ((normalized.y * normalized.y) / (yRadius * yRadius)) <= 1.0;
        return inEllipse;
    }

    function calculateMeanStdDev(sp, ellipse)
    {
        // TODO: Get a real statistics library here that supports large counts

        var sum = 0;
        var sumSquared =0;
        var count = 0;
        var index =0;

        for(var y=ellipse.top; y < ellipse.top + ellipse.height; y++) {
            for(var x=ellipse.left; x < ellipse.left + ellipse.width; x++) {
                if(pointInEllipse(ellipse, {x: x, y: y}) === true)
                {
                    sum += sp[index];
                    sumSquared += sp[index] * sp[index];
                    count++;
                }
                index++;
            }
        }

        if(count === 0) {
            return {
                count: count,
                mean: 0.0,
                variance: 0.0,
                stdDev: 0.0
            };
        }

        var mean = sum / count;
        var variance = sumSquared / count - mean * mean;

        return {
            count: count,
            mean: mean,
            variance: variance,
            stdDev: Math.sqrt(variance)
        };
    }


    function onImageRendered(e, eventData) {

        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if(toolData === undefined) {
            return;
        }

        // we have tool data for this element - iterate over each one and draw it
        var context = eventData.canvasContext.canvas.getContext("2d");
        cornerstone.setToPixelCoordinateSystem(eventData.enabledElement, context);
         //activation color 
        var color=cornerstoneTools.activeToolcoordinate.getToolColor();

        for(var i=0; i < toolData.data.length; i++) {
            context.save();
            var data = toolData.data[i];
           //diffrentiate the color of activation tool
             if (pointNearTool(data,cornerstoneTools.activeToolcoordinate.getCoords())) {
               color=cornerstoneTools.activeToolcoordinate.getActiveColor();
            } else {
               color=cornerstoneTools.activeToolcoordinate.getToolColor();
            }
            // draw the ellipse
            var width = Math.abs(data.handles.start.x - data.handles.end.x);
            var height = Math.abs(data.handles.start.y - data.handles.end.y);
            var left = Math.min(data.handles.start.x, data.handles.end.x);
            var top = Math.min(data.handles.start.y, data.handles.end.y);
            var centerX = (data.handles.start.x + data.handles.end.x) / 2;
            var centerY = (data.handles.start.y + data.handles.end.y) / 2;

            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = 1 / eventData.viewport.scale;
            cornerstoneTools.drawEllipse(context, left, top, width, height);
            context.closePath();

            // draw the handles
            context.beginPath();
            cornerstoneTools.drawHandles(context, eventData, data.handles);
            context.stroke();

            // Calculate the mean, stddev, and area
            // TODO: calculate this in web worker for large pixel counts...
            var pixels = cornerstone.getPixels(eventData.element, left, top, width, height);

            var ellipse = {
                left: left,
                top: top,
                width: width,
                height: height
            };

            var meanStdDev = calculateMeanStdDev(pixels, ellipse);
            var area = Math.PI * (width * eventData.image.columnPixelSpacing / 2) * (height * eventData.image.rowPixelSpacing / 2);
            var areaText = "Area: " + area.toFixed(2) + " mm^2";

            // Draw text
            var fontParameters = cornerstoneTools.setContextToDisplayFontSize(eventData.enabledElement, eventData.canvasContext, 15);
            context.font = "" + fontParameters.fontSize + "px Arial";

            var textSize = context.measureText(area);

            var offset = fontParameters.lineHeight;
            var textX  = centerX < (eventData.image.columns / 2) ? centerX + (width /2): centerX - (width/2) - textSize.width * fontParameters.fontScale;
            var textY  = centerY < (eventData.image.rows / 2) ? centerY + (height /2): centerY - (height/2);

            textX = textX / fontParameters.fontScale;
            textY = textY / fontParameters.fontScale;

            context.fillStyle =color;
            context.fillText("Mean: " + meanStdDev.mean.toFixed(2), textX, textY - offset);
            context.fillText("StdDev: " + meanStdDev.stdDev.toFixed(2), textX, textY);
            context.fillText(areaText, textX, textY + offset);
            context.restore();
        }
    }
    ///////// END IMAGE RENDERING ///////


    // module exports
    cornerstoneTools.ellipticalRoi = cornerstoneTools.mouseButtonTool({
        createNewMeasurement : createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool : pointNearTool,
        toolType : toolType
    });
      cornerstoneTools.ellipticalroi_Touch = cornerstoneTools.touchTool({
        createNewMeasurement: createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool: pointNearTool,
        toolType: toolType
    });

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/imageTools/ellipticalRoi.js

// Begin Source: src/imageTools/highlight.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "highlight";

    ///////// BEGIN ACTIVE TOOL ///////
    function createNewMeasurement(mouseEventData)
    {
        // create the measurement data for this tool with the end handle activated
        var measurementData = {
            visible : true,
            handles : {
                start : {
                    x : mouseEventData.currentPoints.image.x,
                    y : mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: false
                },
                end: {
                    x : mouseEventData.currentPoints.image.x,
                    y : mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: true
                }
            }
        };

        return measurementData;
    }
    ///////// END ACTIVE TOOL ///////

    function pointInsideRect(data, coords)
    {
        var rect = {
            left : Math.min(data.handles.start.x, data.handles.end.x),
            top : Math.min(data.handles.start.y, data.handles.end.y),
            width : Math.abs(data.handles.start.x - data.handles.end.x),
            height : Math.abs(data.handles.start.y - data.handles.end.y)
        };

        var insideBox = false;
        if ((coords.x >= rect.left && coords.x <= (rect.left + rect.width)) &&
            coords.y >= rect.top && coords.y <= (rect.top + rect.height)) {
            insideBox = true;
        }
        return insideBox;
    }

    function pointNearTool(data, coords)
    {
        var rect = {
            left : Math.min(data.handles.start.x, data.handles.end.x),
            top : Math.min(data.handles.start.y, data.handles.end.y),
            width : Math.abs(data.handles.start.x - data.handles.end.x),
            height : Math.abs(data.handles.start.y - data.handles.end.y)
        };

        var distanceToPoint = cornerstoneMath.rect.distanceToPoint(rect, coords);
        return (distanceToPoint < 5);
    }

    ///////// BEGIN IMAGE RENDERING ///////

    function onImageRendered(e, eventData) {

        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if(toolData === undefined) {
            return;
        }

        // we have tool data for this elemen
        var context = eventData.canvasContext.canvas.getContext("2d");
        cornerstone.setToPixelCoordinateSystem(eventData.enabledElement, context);

        //activation color 
        var color=cornerstoneTools.activeToolcoordinate.getToolColor();

        context.save();
        var data = toolData.data[0];
        
        var selectionColor="white",
            toolsColor="white";

        //differentiate the color of activation tool
        var rect = {
            left : Math.min(data.handles.start.x, data.handles.end.x),
            top : Math.min(data.handles.start.y, data.handles.end.y),
            width : Math.abs(data.handles.start.x - data.handles.end.x),
            height : Math.abs(data.handles.start.y - data.handles.end.y)
        };

        // draw the handles
        context.beginPath();
        cornerstoneTools.drawHandles(context, eventData, data.handles, color);
        context.stroke();

        // draw dark fill outside the rectangle
        context.beginPath();
        context.strokeStyle = "transparent";
        context.rect(0, 0, context.canvas.clientWidth, context.canvas.clientHeight);
        context.rect(rect.width + rect.left, rect.top, -rect.width, rect.height);
        context.stroke();
        context.fillStyle = "rgba(0,0,0,0.7)";
        context.fill();
        context.closePath();

        // draw dashed stroke rectangle
        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = 2.5 / eventData.viewport.scale;
        context.setLineDash([4]);
        context.strokeRect(rect.left, rect.top, rect.width, rect.height);
        context.restore();
    }
    ///////// END IMAGE RENDERING ///////


    // module exports
    var preventHandleOutsideImage = true;

    cornerstoneTools.highlight = cornerstoneTools.mouseButtonRectangleTool({
        createNewMeasurement : createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool : pointNearTool,
        pointInsideRect: pointInsideRect,
        toolType : toolType
    }, preventHandleOutsideImage);
    cornerstoneTools.highlightTouch = cornerstoneTools.touchTool({
        createNewMeasurement: createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool: pointNearTool,
        pointInsideRect: pointInsideRect,
        toolType: toolType
    }, preventHandleOutsideImage);

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/imageTools/highlight.js

// Begin Source: src/imageTools/lengthTool.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "length";

    ///////// BEGIN ACTIVE TOOL ///////
    function createNewMeasurement(mouseEventData)
    {
        // create the measurement data for this tool with the end handle activated
        var measurementData = {
            visible : true,
            handles : {
                start : {
                    x : mouseEventData.currentPoints.image.x,
                    y : mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: false
                },
                end: {
                    x : mouseEventData.currentPoints.image.x,
                    y : mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: true
                }
            }
        };

        return measurementData;
    }
    ///////// END ACTIVE TOOL ///////

    function pointNearTool(data, coords)
    {
        var lineSegment = {
            start: data.handles.start,
            end: data.handles.end
        };
        var distanceToPoint = cornerstoneMath.lineSegment.distanceToPoint(lineSegment, coords);
        return (distanceToPoint < 25);
    }

    ///////// BEGIN IMAGE RENDERING ///////
    function onImageRendered(e, eventData) {

        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if(toolData === undefined) {
            return;
        }

        // we have tool data for this element - iterate over each one and draw it
        var context = eventData.canvasContext.canvas.getContext("2d");
        cornerstone.setToPixelCoordinateSystem(eventData.enabledElement, context);
         var color=cornerstoneTools.activeToolcoordinate.getToolColor();
        for(var i=0; i < toolData.data.length; i++) {
            context.save();
            var data = toolData.data[i];
            if (pointNearTool(data,cornerstoneTools.activeToolcoordinate.getCoords())) {
               color=cornerstoneTools.activeToolcoordinate.getActiveColor();
            } else {
               color=cornerstoneTools.activeToolcoordinate.getToolColor();
            }
         
            // draw the line
            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = 1 / eventData.viewport.scale;
            context.moveTo(data.handles.start.x, data.handles.start.y);
            context.lineTo(data.handles.end.x, data.handles.end.y);
            context.stroke();

            // draw the handles
            context.beginPath();
            cornerstoneTools.drawHandles(context, eventData, data.handles,color);
            context.stroke();

            // Draw the text
            context.fillStyle = color;
            var dx = (data.handles.start.x - data.handles.end.x) * eventData.image.columnPixelSpacing;
            var dy = (data.handles.start.y - data.handles.end.y) * eventData.image.rowPixelSpacing;
            var length = Math.sqrt(dx * dx + dy * dy);
            var text = "" + length.toFixed(2) + " mm";

            var fontParameters = cornerstoneTools.setContextToDisplayFontSize(eventData.enabledElement, eventData.canvasContext, 15);
            context.font = "" + fontParameters.fontSize + "px Arial";

            var textX = (data.handles.start.x + data.handles.end.x) / 2 / fontParameters.fontScale;
            var textY = (data.handles.start.y + data.handles.end.y) / 2 / fontParameters.fontScale;
            context.fillText(text, textX, textY);
            context.restore();
        }

    }
    ///////// END IMAGE RENDERING ///////


    // module exports
    cornerstoneTools.length = cornerstoneTools.mouseButtonTool({
        createNewMeasurement : createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool : pointNearTool,
        toolType : toolType
    });
    cornerstoneTools.lengthTouch = cornerstoneTools.touchTool({
        createNewMeasurement: createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool: pointNearTool,
        toolType: toolType
    });
    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/imageTools/lengthTool.js

// Begin Source: src/imageTools/pan.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function mouseUpCallback(e, eventData)
    {
        $(eventData.element).off("CornerstoneToolsMouseDrag", mouseDragCallback);
        $(eventData.element).off("CornerstoneToolsMouseUp", mouseUpCallback);
    }

    function mouseDownCallback(e, eventData)
    {
        if(cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {
            $(eventData.element).on("CornerstoneToolsMouseDrag", mouseDragCallback);
            $(eventData.element).on("CornerstoneToolsMouseUp", mouseUpCallback);
            return false; // false = cases jquery to preventDefault() and stopPropagation() this event
        }
    }

    function mouseDragCallback(e, eventData) {
        eventData.viewport.translation.x += (eventData.deltaPoints.page.x / eventData.viewport.scale);
        eventData.viewport.translation.y += (eventData.deltaPoints.page.y / eventData.viewport.scale);
        cornerstone.setViewport(eventData.element, eventData.viewport);
        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }

    function onDrag(e, eventData) {
        var dragData = eventData;
        dragData.viewport.translation.x += (dragData.deltaPoints.page.x / dragData.viewport.scale);
        dragData.viewport.translation.y += (dragData.deltaPoints.page.y / dragData.viewport.scale);
        cornerstone.setViewport(dragData.element, dragData.viewport);
        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }

    cornerstoneTools.pan = cornerstoneTools.simpleMouseButtonTool(mouseDownCallback);
    cornerstoneTools.panTouchDrag = cornerstoneTools.touchDragTool(onDrag);

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/imageTools/pan.js

// Begin Source: src/imageTools/probe.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "probe";

    ///////// BEGIN ACTIVE TOOL ///////
    function createNewMeasurement(mouseEventData)
    {
        // create the measurement data for this tool with the end handle activated
        var measurementData = {
            visible: true,
            handles: {
                end: {
                    x: mouseEventData.currentPoints.image.x,
                    y: mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: true
                }
            }
        };
        return measurementData;
    }
    ///////// END ACTIVE TOOL ///////

    function calculateSUV(image, storedPixelValue)
    {
        // if no dicom data set, return undefined
        if(image.data === undefined) {
            return undefined;
        }
        // image must be PET
        if(image.data.string('x00080060') !== "PT")
        {
            return undefined;
        }
        var modalityPixelValue = storedPixelValue * image.slope + image.intercept;

        var patientWeight = image.data.floatString('x00101030'); // in kg
        if(patientWeight === undefined)
        {
            return undefined;
        }
        var petSequence = image.data.elements.x00540016;
        if(petSequence === undefined) {
            return undefined;
        }
        petSequence = petSequence.items[0].dataSet;
        var startTime = petSequence.time('x00181072');
        var totalDose = petSequence.floatString('x00181074');
        var halfLife = petSequence.floatString('x00181075');
        var acquisitionTime = image.data.time('x00080032');
        if(startTime === undefined || totalDose === undefined || halfLife === undefined || acquisitionTime === undefined)
        {
            return undefined;
        }

        var acquisitionTimeInSeconds = acquisitionTime.fractionalSeconds + acquisitionTime.seconds + acquisitionTime.minutes * 60 + acquisitionTime.hours * 60 * 60;
        var injectionStartTimeInSeconds = startTime.fractionalSeconds + startTime.seconds + startTime.minutes * 60 + startTime.hours * 60 * 60;
        var durationInSeconds = acquisitionTimeInSeconds - injectionStartTimeInSeconds;
        var correctedDose = totalDose * Math.exp(-durationInSeconds * Math.log(2) / halfLife);
        var suv = modalityPixelValue * patientWeight / correctedDose * 1000;

        return suv;
    }
    ///////// BEGIN IMAGE RENDERING ///////

    function onImageRendered(e, eventData) {

        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if(toolData === undefined) {
            return;
        }

        // we have tool data for this element - iterate over each one and draw it
        var context = eventData.canvasContext.canvas.getContext("2d");
        cornerstone.setToPixelCoordinateSystem(eventData.enabledElement, context);
        var color="white";
        for(var i=0; i < toolData.data.length; i++) {
            context.save();
            var data = toolData.data[i];

            // draw the handles
            context.beginPath();
            cornerstoneTools.drawHandles(context, eventData, data.handles,color);
            context.stroke();

            // Draw text
            var fontParameters = cornerstoneTools.setContextToDisplayFontSize(eventData.enabledElement, eventData.canvasContext, 15);
            context.font = "" + fontParameters.fontSize + "px Arial";

            // translate the x/y away from the cursor
            var x = Math.round(data.handles.end.x);
            var y = Math.round(data.handles.end.y);
            textX = data.handles.end.x + 3;
            textY = data.handles.end.y - 3;

            var textX = textX / fontParameters.fontScale;
            var textY = textY / fontParameters.fontScale;

            context.fillStyle = "white";

            var storedPixels = cornerstone.getStoredPixels(eventData.element, x, y, 1, 1);
            var sp = storedPixels[0];
            var mo = sp * eventData.image.slope + eventData.image.intercept;
            var suv = calculateSUV(eventData.image, sp);


            context.fillText("" + x + "," + y, textX, textY);
            var str = "SP: " + sp + " MO: " + mo.toFixed(3);
            if(suv !== undefined) {
                str += " SUV: " + suv.toFixed(3);
            }
            context.fillText(str, textX, textY + fontParameters.lineHeight);

            context.restore();
        }
    }
    ///////// END IMAGE RENDERING ///////


    // module exports
    cornerstoneTools.probe = cornerstoneTools.mouseButtonTool({
        createNewMeasurement : createNewMeasurement,
        onImageRendered: onImageRendered,
        toolType : toolType
    });
    cornerstoneTools.probeTouch = cornerstoneTools.touchTool({
        createNewMeasurement: createNewMeasurement,
        onImageRendered: onImageRendered,
        toolType: toolType
    });

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/imageTools/probe.js

// Begin Source: src/imageTools/rectangleRoi.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "rectangleRoi";

    ///////// BEGIN ACTIVE TOOL ///////
    function createNewMeasurement(mouseEventData)
    {
        // create the measurement data for this tool with the end handle activated
        var measurementData = {
            visible : true,
            handles : {
                start : {
                    x : mouseEventData.currentPoints.image.x,
                    y : mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: false
                },
                end: {
                    x : mouseEventData.currentPoints.image.x,
                    y : mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: true
                }
            }
        };

        return measurementData;
    }
    ///////// END ACTIVE TOOL ///////

    function pointNearTool(data, coords)
    {
        var rect = {
            left : Math.min(data.handles.start.x, data.handles.end.x),
            top : Math.min(data.handles.start.y, data.handles.end.y),
            width : Math.abs(data.handles.start.x - data.handles.end.x),
            height : Math.abs(data.handles.start.y - data.handles.end.y)
        };

        var distanceToPoint = cornerstoneMath.rect.distanceToPoint(rect, coords);
        return (distanceToPoint < 5);
    }

    ///////// BEGIN IMAGE RENDERING ///////

    function calculateMeanStdDev(sp, ellipse)
    {
        // TODO: Get a real statistics library here that supports large counts

        var sum = 0;
        var sumSquared =0;
        var count = 0;
        var index =0;

        for(var y=ellipse.top; y < ellipse.top + ellipse.height; y++) {
            for(var x=ellipse.left; x < ellipse.left + ellipse.width; x++) {
               sum += sp[index];
                sumSquared += sp[index] * sp[index];
                count++;
                index++;
            }
        }

        if(count === 0) {
            return {
                count: count,
                mean: 0.0,
                variance: 0.0,
                stdDev: 0.0
            };
        }

        var mean = sum / count;
        var variance = sumSquared / count - mean * mean;

        return {
            count: count,
            mean: mean,
            variance: variance,
            stdDev: Math.sqrt(variance)
        };
    }


    function onImageRendered(e, eventData) {

        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if(toolData === undefined) {
            return;
        }

        // we have tool data for this element - iterate over each one and draw it
        var context = eventData.canvasContext.canvas.getContext("2d");
        cornerstone.setToPixelCoordinateSystem(eventData.enabledElement, context);
        //activation color 
        var color=cornerstoneTools.activeToolcoordinate.getToolColor();

        for(var i=0; i < toolData.data.length; i++) {
            context.save();
            var data = toolData.data[i];
             //diffrentiate the color of activation tool
             if (pointNearTool(data,cornerstoneTools.activeToolcoordinate.getCoords())) {
               color=cornerstoneTools.activeToolcoordinate.getActiveColor();
            } else {
               color=cornerstoneTools.activeToolcoordinate.getToolColor();
            }

            // draw the ellipse
            var width = Math.abs(data.handles.start.x - data.handles.end.x);
            var height = Math.abs(data.handles.start.y - data.handles.end.y);
            var left = Math.min(data.handles.start.x, data.handles.end.x);
            var top = Math.min(data.handles.start.y, data.handles.end.y);
            var centerX = (data.handles.start.x + data.handles.end.x) / 2;
            var centerY = (data.handles.start.y + data.handles.end.y) / 2;

            context.beginPath();
            context.strokeStyle = color;
            context.lineWidth = 1 / eventData.viewport.scale;
            context.rect(left, top, width, height);
            context.stroke();

            // draw the handles
            context.beginPath();
            cornerstoneTools.drawHandles(context, eventData, data.handles,color);
            context.stroke();

            // Calculate the mean, stddev, and area
            // TODO: calculate this in web worker for large pixel counts...
            var pixels = cornerstone.getPixels(eventData.element, left, top, width, height);

            var ellipse = {
                left: left,
                top: top,
                width: width,
                height: height
            };

            var meanStdDev = calculateMeanStdDev(pixels, ellipse);
            var area = (width * eventData.image.columnPixelSpacing) * (height * eventData.image.rowPixelSpacing);
            var areaText = "Area: " + area.toFixed(2) + " mm^2";

            // Draw text
            var fontParameters = cornerstoneTools.setContextToDisplayFontSize(eventData.enabledElement, eventData.canvasContext, 15);
            context.font = "" + fontParameters.fontSize + "px Arial";

            var textSize = context.measureText(area);

            var offset = fontParameters.lineHeight;
            var textX  = centerX < (eventData.image.columns / 2) ? centerX + (width /2): centerX - (width/2) - textSize.width * fontParameters.fontScale;
            var textY  = centerY < (eventData.image.rows / 2) ? centerY + (height /2): centerY - (height/2);

            textX = textX / fontParameters.fontScale;
            textY = textY / fontParameters.fontScale;

            context.fillStyle =color;
            context.fillText("Mean: " + meanStdDev.mean.toFixed(2), textX, textY - offset);
            context.fillText("StdDev: " + meanStdDev.stdDev.toFixed(2), textX, textY);
            context.fillText(areaText, textX, textY + offset);
            context.restore();
        }
    }
    ///////// END IMAGE RENDERING ///////


    // module exports
    cornerstoneTools.rectangleRoi = cornerstoneTools.mouseButtonTool({
        createNewMeasurement : createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool : pointNearTool,
        toolType : toolType
    });
    cornerstoneTools.rectangleRoiTouch = cornerstoneTools.touchTool({
        createNewMeasurement: createNewMeasurement,
        onImageRendered: onImageRendered,
        pointNearTool: pointNearTool,
        toolType: toolType
    });

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/imageTools/rectangleRoi.js

// Begin Source: src/imageTools/wwwc.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function mouseUpCallback(e, eventData)
    {
        $(eventData.element).off("CornerstoneToolsMouseDrag", mouseDragCallback);
        $(eventData.element).off("CornerstoneToolsMouseUp", mouseUpCallback);
    }

    function mouseDownCallback(e, eventData)
    {
        if(cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {
            $(eventData.element).on("CornerstoneToolsMouseDrag", mouseDragCallback);
            $(eventData.element).on("CornerstoneToolsMouseUp", mouseUpCallback);
            return false; // false = cases jquery to preventDefault() and stopPropagation() this event
        }
    }

    function mouseDragCallback(e, eventData)
    {
        // here we normalize the ww/wc adjustments so the same number of on screen pixels
        // adjusts the same percentage of the dynamic range of the image.  This is needed to
        // provide consistency for the ww/wc tool regardless of the dynamic range (e.g. an 8 bit
        // image will feel the same as a 16 bit image would)
        var imageDynamicRange = eventData.image.maxPixelValue - eventData.image.minPixelValue;
        var multiplier = imageDynamicRange / 1024;

        eventData.viewport.voi.windowWidth += (eventData.deltaPoints.page.x * multiplier);
        eventData.viewport.voi.windowCenter += (eventData.deltaPoints.page.y * multiplier);
        cornerstone.setViewport(eventData.element, eventData.viewport);
        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }

    function touchDragCallback(e,eventData)
    {
        var dragData = eventData;

        var imageDynamicRange = dragData.image.maxPixelValue - dragData.image.minPixelValue;
        var multiplier = imageDynamicRange / 1024;

        dragData.viewport.voi.windowWidth += (dragData.deltaPoints.page.x * multiplier);
        dragData.viewport.voi.windowCenter += (dragData.deltaPoints.page.y * multiplier);
        cornerstone.setViewport(dragData.element, dragData.viewport);
    }

    cornerstoneTools.wwwc = cornerstoneTools.simpleMouseButtonTool(mouseDownCallback);
    cornerstoneTools.wwwcTouchDrag = cornerstoneTools.touchDragTool(touchDragCallback);


    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/imageTools/wwwc.js

// Begin Source: src/imageTools/zoom.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function zoom(element, viewport, ticks)
    {
        // Calculate the new scale factor based on how far the mouse has changed
        var pow = 1.7;
        var oldFactor = Math.log(viewport.scale) / Math.log(pow);
        var factor = oldFactor + ticks;
        var scale = Math.pow(pow, factor);
        viewport.scale = scale;
        cornerstone.setViewport(element, viewport);
    }

    function mouseUpCallback(e, eventData)
    {
        $(eventData.element).off("CornerstoneToolsMouseDrag", mouseDragCallback);
        $(eventData.element).off("CornerstoneToolsMouseUp", mouseUpCallback);

    }
    function mouseDownCallback(e, eventData)
    {
        if(cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {
            $(eventData.element).on("CornerstoneToolsMouseDrag", mouseDragCallback);
            $(eventData.element).on("CornerstoneToolsMouseUp", mouseUpCallback);
            return false; // false = cases jquery to preventDefault() and stopPropagation() this event
        }
    }

    function mouseDragCallback(e, eventData)
    {

        var ticks = eventData.deltaPoints.page.y/100;
        zoom(eventData.element, eventData.viewport, ticks);

        // Now that the scale has been updated, determine the offset we need to apply to the center so we can
        // keep the original start location in the same position
        var newCoords = cornerstone.pageToPixel(eventData.element, eventData.startPoints.page.x, eventData.startPoints.page.y);
        eventData.viewport.translation.x -= eventData.startPoints.image.x - newCoords.x;
        eventData.viewport.translation.y -= eventData.startPoints.image.y - newCoords.y;
        cornerstone.setViewport(eventData.element, eventData.viewport);
        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }

    function mouseWheelCallback(e, eventData)
    {
        var ticks = -eventData.direction / 4;
        zoom(eventData.element, eventData.viewport, ticks);
    }

    function touchPinchCallback(e, eventData)
    {
        var pinchData =eventData;
        zoom(pinchData.element, pinchData.viewport, pinchData.direction / 4);
    }

    function zoomTouchDrag(e, eventData)
    {
        var dragData = eventData;
        var ticks = dragData.deltaPoints.page.y/100;
        zoom(dragData.element, dragData.viewport, ticks);

        // Now that the scale has been updated, determine the offset we need to apply to the center so we can
        // keep the original start location in the same position
        var newCoords = cornerstone.pageToPixel(dragData.element, dragData.startPoints.page.x, dragData.startPoints.page.y);
        dragData.viewport.translation.x -= dragData.startPoints.image.x - newCoords.x;
        dragData.viewport.translation.y -= dragData.startPoints.image.y - newCoords.y;
        cornerstone.setViewport(dragData.element, dragData.viewport);
        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }


    cornerstoneTools.zoom = cornerstoneTools.simpleMouseButtonTool(mouseDownCallback);
    cornerstoneTools.zoomWheel = cornerstoneTools.mouseWheelTool(mouseWheelCallback);
    cornerstoneTools.zoomTouchPinch = cornerstoneTools.touchPinchTool(touchPinchCallback);
    cornerstoneTools.zoomTouchDrag = cornerstoneTools.touchDragTool(zoomTouchDrag);
    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/imageTools/zoom.js

// Begin Source: src/inputSources/touchInput.js
var cornerstoneTools = (function($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    /*jshint newcap: false */

    if (cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var lastScale = 1.0;
    var processingTouch = false;

    var startPoints;
    var lastPoints,touchEventDetail,eventData;
    
   
  
    function activateMouseDown(mouseEventDetail)
    {   
       $(mouseEventDetail.element).trigger("CornerstoneToolsDragStartActive", mouseEventDetail);
       
      
        
    }
    function onTouch(e)
    {
        e.gesture.preventDefault();
        e.gesture.stopPropagation();


        // we use a global flag to keep track of whether or not we are pinching
        // to avoid queueing up tons of events
        if (processingTouch === true)
        {
            return;
        }

        var element = e.currentTarget;
        var event;

        if (e.type === 'transform')
        {
          /*  var scale = lastScale - e.gesture.scale;
            lastScale = e.gesture.scale;
            event = new CustomEvent(
                    "CornerstoneToolsTouchPinch",
                    {
                        detail: {
                            event: e,
                            viewport: cornerstone.getViewport(element),
                            image: cornerstone.getEnabledElement(element).image,
                            element: element,
                            direction: scale < 0 ? 1 : -1
                        },
                        bubbles: false,
                        cancelable: false
                    }
            );*/

          var scale = lastScale - e.gesture.scale;
          lastScale = e.gesture.scale;
          var tranformEvent={event:e,viewport:cornerstone.getViewport(element),mage:cornerstone.getEnabledElement(element).image,element:element,
                             direction:scale < 0 ? 1 : -1
                    };
           event = jQuery.Event("CornerstoneToolsTouchPinch", tranformEvent);
          $(tranformEvent.element).trigger(event, tranformEvent);
          } else if (e.type === 'touch')
          {    
                startPoints = {
                page: cornerstoneMath.point.pageToPoint(e.gesture.touches[0]),
                image: cornerstone.pageToPixel(element, e.gesture.touches[0].pageX, e.gesture.touches[0].pageY)
            };
           
            touchEventDetail = {
                event: e,
                viewport: cornerstone.getViewport(element),
                image: cornerstone.getEnabledElement(element).image,
                element: element,
                startPoints: startPoints,
                lastPoints: lastPoints,
                currentPoints: startPoints,
                deltaPoints: {x: 0, y: 0}
            };
                
            event = jQuery.Event("CornerstoneToolsDragStart", touchEventDetail);
           $(touchEventDetail.element).trigger(event, touchEventDetail);
            lastPoints = cornerstoneTools.copyPoints(startPoints);
            //return cornerstoneTools.pauseEvent(e);
         

             if(event.isImmediatePropagationStopped() === false)
            {
                // no tools responded to this event, give the active tool a chance
                 
                if (activateMouseDown(touchEventDetail) === true)
                {                      
                    return cornerstoneTools.pauseEvent(e);
                }
             
            }
            
         

        }
//        else if (e.type === 'dragstart')
//        {
//            startPoints = {
//                page: cornerstoneMath.point.pageToPoint(e.gesture.touches[0]),
//                image: cornerstone.pageToPixel(element, e.gesture.touches[0].pageX, e.gesture.touches[0].pageY)
//            };
//            lastPoints = cornerstoneTools.copyPoints(startPoints);
//            return;
//        }

        else if (e.type === 'drag')
        {    
            // calculate our current points in page and image coordinates
             currentPoints = {
                page: cornerstoneMath.point.pageToPoint(e.gesture.touches[0]),
                image: cornerstone.pageToPixel(element, e.gesture.touches[0].pageX, e.gesture.touches[0].pageY)
            };

            // Calculate delta values in page and image coordinates
             deltaPoints = {
                page: cornerstoneMath.point.subtract(currentPoints.page, lastPoints.page),
                image: cornerstoneMath.point.subtract(currentPoints.image, lastPoints.image)
            };
          
             eventData={ viewport: cornerstone.getViewport(element),
                        image: cornerstone.getEnabledElement(element).image,
                        element: element,
                        startPoints: startPoints,
                        lastPoints: lastPoints,
                        currentPoints: currentPoints,
                        deltaPoints: deltaPoints
                        };
            $(touchEventDetail.element).trigger("CornerstoneToolsTouchDrag", eventData);

              
           lastPoints = cornerstoneTools.copyPoints(currentPoints);
            

        } else if (e.type === 'dragend')
        {
     

            var currentPoints = {
                page: cornerstoneMath.point.pageToPoint(e.gesture.touches[0]),
                image: cornerstone.pageToPixel(element, e.gesture.touches[0].pageX, e.gesture.touches[0].pageY)
            };

            // Calculate delta values in page and image coordinates
            var deltaPoints = {
                page: cornerstoneMath.point.subtract(currentPoints.page, lastPoints.page),
                image: cornerstoneMath.point.subtract(currentPoints.image, lastPoints.image)
            };

           

              eventData = {
                event: e,
                viewport: cornerstone.getViewport(element),
                image: cornerstone.getEnabledElement(element).image,
                element: element,
                startPoints: startPoints,
                lastPoints: lastPoints,
                currentPoints: currentPoints,
                deltaPoints: deltaPoints
            };
//            element.dispatchEvent(event);
              event = jQuery.Event("CornerstoneToolsDragEnd", eventData);
            $(touchEventDetail.element).trigger(event, eventData);
            return cornerstoneTools.pauseEvent(e);
        } else {
            return;
        }
        

        processingTouch = false;

        // we dispatch the event using a timer to allow the DOM to redraw
        /*setTimeout(function() {
            element.dispatchEvent(event);
            processingTouch = false;
        }, 1);*/
    }

    function enable(element)
    {
        var hammerOptions = {
            transform_always_block: true,
            transform_min_scale: 0.01,
            drag_block_horizontal: true,
            drag_block_vertical: true,
            drag_min_distance: 0

        };
         $(element).hammer(hammerOptions).on("touch drag transform dragstart dragend", onTouch);
    }

    function disable(element) {
         $(element).hammer().off("touch drag transform dragstart dragend", onTouch);
    }

    // module exports
    cornerstoneTools.touchInput = {
        enable: enable,
        disable: disable
    };

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/inputSources/touchInput.js

// Begin Source: src/manipulators/anyHandlesOutsideImage.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function anyHandlesOutsideImage(renderData, handles)
    {
        var image = renderData.image;
        var imageRect = {
            left: 0,
            top: 0,
            width: image.width,
            height: image.height
        };

        var handleOutsideImage = false;
        for(var property in handles) {
            var handle = handles[property];
            if(cornerstoneMath.point.insideRect(handle, imageRect) === false)
            {
                handleOutsideImage = true;
            }
        }
        return handleOutsideImage;
    }

    // module/private exports
    cornerstoneTools.anyHandlesOutsideImage = anyHandlesOutsideImage;

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools)); 
// End Source; src/manipulators/anyHandlesOutsideImage.js

// Begin Source: src/manipulators/drawHandles.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var handleRadius = 6;

    function drawHandles(context, renderData, handles,color)
    {
        context.strokeStyle = color;
        var radius = handleRadius / renderData.viewport.scale;
        for(var property in handles) {
            var handle = handles[property];
            if(handle.active || handle.highlight) {
                context.beginPath();
                if(handle.active)
                {
                    context.lineWidth = 2 / renderData.viewport.scale;
                }
                else
                {
                    context.lineWidth = 0.5 / renderData.viewport.scale;
                }
                context.arc(handle.x, handle.y, radius, 0, 2 * Math.PI);
                context.stroke();
            }
        }
    }


    // module/private exports
    cornerstoneTools.drawHandles = drawHandles;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/manipulators/drawHandles.js

// Begin Source: src/manipulators/handleActivator.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var handleRadius = 6;

    function findHandleNear(handles, imagePoint, scale)
    {
        var handleRadiusScaled = handleRadius / scale;

        for(var property in handles) {
            var handle = handles[property];
            var distance = cornerstoneMath.point.distance(imagePoint, handle);
            if(distance <= handleRadiusScaled)
            {
                return handle;
            }
        }
        return undefined;
    }

    function getActiveHandle(handles) {
        for(var property in handles) {
            var handle = handles[property];
            if(handle.active === true) {
                return handle;
            }
        }
        return undefined;
    }

    function handleActivator(handles, imagePoint, scale)
    {
        var activeHandle = getActiveHandle(handles);
        var nearbyHandle = findHandleNear(handles, imagePoint, scale);
        if(activeHandle !== nearbyHandle)
        {
            if(nearbyHandle !== undefined) {
                nearbyHandle.active = true;
            }
            if(activeHandle !== undefined) {
                activeHandle.active = false;
            }
            return true;
        }
        return false;
    }


    // module/private exports

    cornerstoneTools.handleActivator = handleActivator;
    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools)); 
// End Source; src/manipulators/handleActivator.js

// Begin Source: src/manipulators/handleMover.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function moveHandle(mouseEventData, handle, doneMovingCallback, preventHandleOutsideImage)
    {
        var element = mouseEventData.element;

        function mouseDragCallback(e, eventData) {
            handle.x = eventData.currentPoints.image.x;
            handle.y = eventData.currentPoints.image.y;
            if (preventHandleOutsideImage)
            {
                if (handle.x < 0)
                {
                    handle.x = 0;
                }
                if (handle.x > eventData.image.width)
                {
                    handle.x = eventData.image.width;
                }
                if (handle.y < 0)
                {
                    handle.y = 0;
                }
                if (handle.y > eventData.image.height)
                {
                    handle.y = eventData.image.height;
                }
            }
            cornerstone.updateImage(element);
        }
        $(element).on("CornerstoneToolsMouseDrag", mouseDragCallback);

        function mouseUpCallback(e, eventData) {
            handle.eactive = false;
            $(element).off("CornerstoneToolsMouseDrag", mouseDragCallback);
            $(element).off("CornerstoneToolsMouseUp", mouseUpCallback);
            cornerstone.updateImage(element);

            doneMovingCallback();
        }
        $(element).on("CornerstoneToolsMouseUp", mouseUpCallback);
    }


    // module/private exports
    cornerstoneTools.moveHandle = moveHandle;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/manipulators/handleMover.js

// Begin Source: src/manipulators/handleTouchMove.js
// Begin Source: src/manipulators/handletouchMover.js
var cornerstoneTools = (function($, cornerstone, cornerstoneTools) {

    "use strict";

    if (cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function touchmoveHandle(touchEventData, handle, doneMovingCallback)
    {
        var element = touchEventData.element;

        function touchDragCallback(e,eventData) {
            var toucheMoveData = eventData;
            handle.x = toucheMoveData.currentPoints.image.x;
            handle.y = toucheMoveData.currentPoints.image.y;
            cornerstone.updateImage(element);
        }
        $(element).on("CornerstoneToolsTouchDrag", touchDragCallback);

        function touchendCallback(mouseMoveData) {
            handle.eactive = false;
            $(element).off("CornerstoneToolsTouchDrag", touchDragCallback);
            $(element).off("CornerstoneToolsDragEnd", touchendCallback);
            cornerstone.updateImage(element);

            doneMovingCallback();
        }
        $(element).on("CornerstoneToolsDragEnd", touchendCallback);
    }


    // module/private exports
    cornerstoneTools.touchmoveHandle = touchmoveHandle;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/manipulators/handleTouchMove.js

// Begin Source: src/manipulators/moveAllHandles.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }



    function moveAllHandles(e, data, toolData, deleteIfHandleOutsideImage, preventHandleOutsideImage)
    {
        var mouseEventData = e;
        var element = mouseEventData.element;

        function mouseDragCallback(e, eventData)
        {
            for(var property in data.handles) {
                var handle = data.handles[property];
                handle.x += eventData.deltaPoints.image.x;
                handle.y += eventData.deltaPoints.image.y;
                if (preventHandleOutsideImage)
                {
                    if (handle.x < 0)
                    {
                        handle.x = 0;
                    }
                    if (handle.x > eventData.image.width)
                    {
                        handle.x = eventData.image.width;
                    }
                    if (handle.y < 0)
                    {
                        handle.y = 0;
                    }
                    if (handle.y > eventData.image.height)
                    {
                        handle.y = eventData.image.height;
                    }
                }
            }
            cornerstone.updateImage(element);
            return false; // false = cases jquery to preventDefault() and stopPropagation() this event
        }

        $(element).on("CornerstoneToolsMouseDrag", mouseDragCallback);

        function mouseUpCallback(e, eventData) {
            data.moving = false;

            $(element).off('CornerstoneToolsMouseDrag', mouseDragCallback);
            $(element).off('CornerstoneToolsMouseUp', mouseUpCallback);

            // If any handle is outside the image, delete the tool data

            if(deleteIfHandleOutsideImage === true) {
                var image = eventData.image;//.getEnabledElement(element).image;
                var handleOutsideImage = false;
                var rect = {
                    top: 0,
                    left: 0,
                    width: image.width,
                    height: image.height
                };
                for(var property in data.handles) {
                    var handle = data.handles[property];
                    if(cornerstoneMath.point.insideRect(handle, rect) === false)
                    {
                        handleOutsideImage = true;
                    }
                }

                if(handleOutsideImage)
                {
                    // find this tool data
                    var indexOfData = -1;
                    for(var i = 0; i < toolData.data.length; i++) {
                        if(toolData.data[i] === data)
                        {
                            indexOfData = i;
                        }
                    }
                    if(indexOfData !== -1) {
                        toolData.data.splice(indexOfData, 1);
                    }
                }
            }
            cornerstone.updateImage(element);
         }
        $(element).on("CornerstoneToolsMouseUp",mouseUpCallback);
        return true;
    }


    // module/private exports
    cornerstoneTools.moveAllHandles = moveAllHandles;

    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/manipulators/moveAllHandles.js

// Begin Source: src/manipulators/touchmoveAllHandles.js
// Begin Source: src/manipulators/touchmoveAllHandles.js
var cornerstoneTools = (function($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if (cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }
    function touchmoveAllHandles(e, data, toolData, deleteIfHandleOutsideImage)
    {
        var touchEventData = e;
        var element = touchEventData.element;

        function touchDragCallback(e,eventData)
        {
            var touchMoveData = eventData;
            for (var property in data.handles) {
                var handle = data.handles[property];
                handle.x += touchMoveData.deltaPoints.image.x;
                handle.y += touchMoveData.deltaPoints.image.y;
            }
            cornerstone.updateImage(element);
            return false; // false = cases jquery to preventDefault() and stopPropagation() this event
        }

        $(element).on("CornerstoneToolsTouchDrag", touchDragCallback);

        function touchendCallback(e,eventData) {
            data.moving = false;
            var touchendData = eventData;

            $(element).off('CornerstoneToolsTouchDrag', touchDragCallback);
            $(element).off('CornerstoneToolsDragEnd', touchendCallback);

            // If any handle is outside the image, delete the tool data

            if (deleteIfHandleOutsideImage === true) {
                var image = touchendData.image;//.getEnabledElement(element).image;
                var handleOutsideImage = false;
                var rect = {
                    top: 0,
                    left: 0,
                    width: image.width,
                    height: image.height
                };
                for (var property in data.handles) {
                    var handle = data.handles[property];
                    if (cornerstoneMath.point.insideRect(handle, rect) === false)
                    {
                        handleOutsideImage = true;
                    }
                }

                if (handleOutsideImage)
                {
                    // find this tool data
                    var indexOfData = -1;
                    for (var i = 0; i < toolData.data.length; i++) {
                        if (toolData.data[i] === data)
                        {
                            indexOfData = i;
                        }
                    }
                    if (indexOfData !== -1) {
                        toolData.data.splice(indexOfData, 1);
                    }
                }
            }
            cornerstone.updateImage(element);
        }
        $(element).on("CornerstoneToolsDragEnd", touchendCallback);
        return true;
    }
    // module/private exports
    cornerstoneTools.touchmoveAllHandles = touchmoveAllHandles;
    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools));
 
// End Source; src/manipulators/touchmoveAllHandles.js

// Begin Source: src/measurementManager/lineSample.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This object manages a collection of measurements
    function LineSampleMeasurement() {

        var that = this;
        that.samples = [];

        // adds an element as both a source and a target
        this.set = function(samples) {
            that.samples = samples;
            // fire event
            $(that).trigger("CornerstoneLineSampleUpdated");
        };
    }

    // module/private exports
    cornerstoneTools.LineSampleMeasurement = LineSampleMeasurement;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/measurementManager/lineSample.js

// Begin Source: src/measurementManager/measurementManager.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This object manages a collection of measurements
    function MeasurementManager() {

        var that = this;
        that.measurements = [];

        // adds an element as both a source and a target
        this.add = function(measurement) {
            var index = that.measurements.push(measurement);
            // fire event
            var eventDetail = {
                index: index,
                measurement: measurement
            };
            $(that).trigger("CornerstoneMeasurementAdded", eventDetail);
        };

        this.remove = function(index) {
            var measurement = that.measurements[index];
            that.measurements.splice(index, 1);
            // fire event
            var eventDetail = {
                index: index,
                measurement: measurement
            };
            $(that).trigger("CornerstoneMeasurementRemoved", eventDetail);
        };

    }

    // module/private exports
    cornerstoneTools.MeasurementManager = new MeasurementManager();
    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/measurementManager/measurementManager.js

// Begin Source: src/metaData.js
// this module defines a way for tools to access various metadata about an imageId.  This layer of abstraction exists
// so metadata can be provided to the tools in different ways (e.g. by parsing DICOM P10 or by a WADO-RS document)
// NOTE: We may want to push this function down into the cornerstone core library, not sure yet...

var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var providers = [];

    function addProvider( provider)
    {
        providers.push(provider);
    }

    function removeProvider( provider)
    {
        var index = providers.indexOf(provider);
        if(index === -1) {
            return;
        }
        providers.splice(index, 1);
    }

    function getMetaData(type, imageId)
    {
        var result;
        $.each(providers, function(index, provider) {
            result = provider(type, imageId);
            if(result !== undefined) {
                return true;
            }
        });
        return result;
    }

    // module/private exports
    cornerstoneTools.metaData =
    {
        addProvider: addProvider,
        removeProvider: removeProvider,
        get : getMetaData
    };

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/metaData.js

// Begin Source: src/referenceLines/calculateReferenceLine.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }
    if(cornerstoneTools.referenceLines === undefined) {
        cornerstoneTools.referenceLines = {};
    }

    // calculates a reference line between two planes by projecting the top left hand corner and bottom right hand corner
    // of the reference image onto the target image.  Ideally we would calculate the intersection between the planes but
    // that requires a bit more math and this works fine for most cases
    function calculateReferenceLine(targetImagePlane, referenceImagePlane)
    {
        var tlhcPatient = referenceImagePlane.imagePositionPatient;
        var tlhcImage = cornerstoneTools.projectPatientPointToImagePlane(tlhcPatient, targetImagePlane);

        var brhcPatient = cornerstoneTools.imagePointToPatientPoint({x:referenceImagePlane.columns, y:referenceImagePlane.rows}, referenceImagePlane);
        var brhcImage = cornerstoneTools.projectPatientPointToImagePlane(brhcPatient, targetImagePlane);

        var referenceLineSegment = {
            start : {x :tlhcImage.x, y:tlhcImage.y},
            end : {x :brhcImage.x, y:brhcImage.y}
        };
        return referenceLineSegment;
    }

    // module/private exports
    cornerstoneTools.referenceLines.calculateReferenceLine = calculateReferenceLine;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/referenceLines/calculateReferenceLine.js

// Begin Source: src/referenceLines/referenceLinesTool.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }
    if(cornerstoneTools.referenceLines === undefined) {
        cornerstoneTools.referenceLines = {};
    }

    var toolType = "referenceLines";

    function onImageRendered(e, eventData)
    {
        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if (toolData === undefined) {
            return;
        }

        // Get the enabled elements associated with this synchronization context and draw them
        var syncContext = toolData.data[0].synchronizationContext;
        var enabledElements = syncContext.getSourceElements();

        var renderer = toolData.data[0].renderer;

        // Create the canvas context and reset it to the pixel coordinate system
        var context = eventData.canvasContext.canvas.getContext("2d");
        cornerstone.setToPixelCoordinateSystem(eventData.enabledElement, context);

        // Iterate over each referenced element
        $.each(enabledElements, function(index, referenceEnabledElement) {

            // don't draw ourselves
            if (referenceEnabledElement === e.currentTarget) {
                return;
            }

            // render it
            renderer(context, eventData, e.currentTarget, referenceEnabledElement);
        });
    }

    // enables the reference line tool for a given element.  Note that a custom renderer
    // can be provided if you want different rendering (e.g. all reference lines, first/last/active, etc)
    function enable(element, synchronizationContext, renderer)
    {
        renderer = renderer || cornerstoneTools.referenceLines.renderActiveReferenceLine;

        cornerstoneTools.addToolState(element, toolType, {
            synchronizationContext : synchronizationContext,
            renderer : renderer
        });
        $(element).on("CornerstoneImageRendered", onImageRendered);
        cornerstone.updateImage(element);
    }

    // disables the reference line tool for the given element
    function disable(element, synchronizationContext)
    {
        $(element).off("CornerstoneImageRendered", onImageRendered);
        cornerstone.updateImage(element);
    }

    // module/private exports
    cornerstoneTools.referenceLines.tool = {
        enable: enable,
        disable: disable

    };

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/referenceLines/referenceLinesTool.js

// Begin Source: src/referenceLines/renderActiveReferenceLine.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }
    if(cornerstoneTools.referenceLines === undefined) {
        cornerstoneTools.referenceLines = {};
    }

    // renders the active reference line
    function renderActiveReferenceLine(context, eventData, targetElement, referenceElement)
    {
        var targetImage = cornerstone.getEnabledElement(targetElement).image;
        var referenceImage = cornerstone.getEnabledElement(referenceElement).image;

        // make sure the images are actually loaded for the target and reference
        if(targetImage === undefined || referenceImage === undefined) {
            return;
        }

        var targetImagePlane = cornerstoneTools.metaData.get('imagePlane', targetImage.imageId);
        var referenceImagePlane = cornerstoneTools.metaData.get('imagePlane', referenceImage.imageId);

        // the image planes must be in the same frame of reference
        if(targetImagePlane.frameOfReferenceUID != referenceImagePlane.frameOfReferenceUID) {
            return;
        }

        // the image plane normals must be > 30 degrees apart
        var targetNormal = targetImagePlane.rowCosines.clone().cross(targetImagePlane.columnCosines);
        var referenceNormal = referenceImagePlane.rowCosines.clone().cross(referenceImagePlane.columnCosines);
        var angleInRadians = targetNormal.angleTo(referenceNormal);
        angleInRadians = Math.abs(angleInRadians);
        if(angleInRadians < 0.5) { // 0.5 radians = ~30 degrees
            return;
        }

        var referenceLine = cornerstoneTools.referenceLines.calculateReferenceLine(targetImagePlane, referenceImagePlane);

        var color=cornerstoneTools.activeToolcoordinate.getActiveColor();

        // draw the referenceLines
        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = 1 / eventData.viewport.scale;
        context.moveTo(referenceLine.start.x, referenceLine.start.y);
        context.lineTo(referenceLine.end.x, referenceLine.end.y);
        context.stroke();
    }

    // module/private exports
    cornerstoneTools.referenceLines.renderActiveReferenceLine = renderActiveReferenceLine;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/referenceLines/renderActiveReferenceLine.js

// Begin Source: src/stackTools/playClip.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "playClip";

    /**
     * Starts playing a clip or adjusts the frame rate of an already playing clip.  framesPerSecond is
     * optional and defaults to 30 if not specified.  A negative framesPerSecond will play the clip in reverse.
     * The element must be a stack of images
     * @param element
     * @param framesPerSecond
     */
    function playClip(element, framesPerSecond)
    {
        if(element === undefined) {
            throw "playClip: element must not be undefined";
        }
        if(framesPerSecond === undefined) {
            framesPerSecond = 30;
        }

        var stackToolData = cornerstoneTools.getToolState(element, 'stack');
        if (stackToolData === undefined || stackToolData.data === undefined || stackToolData.data.length === 0) {
            return;
        }
        var stackData = stackToolData.data[0];

        var playClipToolData = cornerstoneTools.getToolState(element, toolType);
        var playClipData;
        if (playClipToolData === undefined || playClipToolData.data.length === 0) {
            playClipData = {
                intervalId : undefined,
                framesPerSecond: framesPerSecond,
                lastFrameTimeStamp: undefined,
                frameRate: 0
            };
            cornerstoneTools.addToolState(element, toolType, playClipData);
        }
        else {
            playClipData = playClipToolData.data[0];
            playClipData.framesPerSecond = framesPerSecond;
        }

        // if already playing, do not set a new interval
        if(playClipData.intervalId !== undefined) {
            return;
        }

        playClipData.intervalId = setInterval(function() {

            var newImageIdIndex = stackData.currentImageIdIndex;
            if(playClipData.framesPerSecond > 0) {
                newImageIdIndex++;
            } else {
                newImageIdIndex--;
            }

            // loop around if we go outside the stack
            if (newImageIdIndex >= stackData.imageIds.length)
            {
                newImageIdIndex =0;
            }
            if(newImageIdIndex < 0) {
                newImageIdIndex = stackData.imageIds.length -1;
            }

            if(newImageIdIndex !== stackData.currentImageIdIndex)
            {
                var viewport = cornerstone.getViewport(element);
                cornerstone.loadAndCacheImage(stackData.imageIds[newImageIdIndex]).then(function(image) {
                    stackData.currentImageIdIndex = newImageIdIndex;
                    cornerstone.displayImage(element, image, viewport);
                });
            }
        }, 1000/Math.abs(playClipData.framesPerSecond));
    }

    /**
     * Stops an already playing clip.
     * * @param element
     */
    function stopClip(element)
    {
        var playClipToolData = cornerstoneTools.getToolState(element, toolType);
        var playClipData;
        if (playClipToolData === undefined || playClipToolData.data.length === 0) {
            return;
        }
        else {
            playClipData = playClipToolData.data[0];
        }

        clearInterval(playClipData.intervalId);
        playClipData.intervalId = undefined;
    }


    // module/private exports
    cornerstoneTools.playClip = playClip;
    cornerstoneTools.stopClip = stopClip;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/stackTools/playClip.js

// Begin Source: src/stackTools/stackPrefetch.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "stackPrefetch";

    function prefetch(element)
    {
        var stackData = cornerstoneTools.getToolState(element, 'stack');
        if(stackData === undefined || stackData.data === undefined || stackData.data.length === 0) {
            return;
        }

        var stackPrefetchData = cornerstoneTools.getToolState(element, toolType);
        if(stackPrefetchData === undefined) {
            // should not happen
            return;
        }

        var stackPrefetch = stackPrefetchData.data[0];

        var stack = stackData.data[0];

        if(stack.enabled === false) {
            return;
        }

        var stackPrefetchImageIdIndex = stackPrefetch.prefetchImageIdIndex + 1;
        stackPrefetchImageIdIndex = Math.min(stack.imageIds.length - 1, stackPrefetchImageIdIndex);
        stackPrefetchImageIdIndex = Math.max(0, stackPrefetchImageIdIndex);

        // if no change turn off prefetching for this stack
        if(stackPrefetchImageIdIndex === stackPrefetch.prefetchImageIdIndex)
        {
            stackPrefetch.enabled = false;
            return;
        }

        stackPrefetch.prefetchImageIdIndex = stackPrefetchImageIdIndex;

        var imageId = stack.imageIds[stackPrefetchImageIdIndex];

        var loadImageDeferred = cornerstone.loadAndCacheImage(imageId);

        loadImageDeferred.done(function(image)
        {
            // if we are no longer enabled, do not try to prefetch again
            if(stack.enabled === false) {
                return;
            }

            // image has been loaded, call prefetch on the next image
            setTimeout(function() {
                prefetch(element);
            }, 1);
        });
    }

    function enable(element)
    {
        var stackPrefetchData = cornerstoneTools.getToolState(element, toolType);
        if(stackPrefetchData === undefined) {
            stackPrefetchData = {
                prefetchImageIdIndex : 0,
                enabled: true
            };
            cornerstoneTools.addToolState(element, toolType, stackPrefetchData);
        }

        prefetch(element);
    }

    function disable(element)
    {
        var stackPrefetchData = cornerstoneTools.getToolState(element, toolType);
        if(stackPrefetchData === undefined) {
            stackPrefetchData = {
                prefetchImageIdIndex : 0,
                enabled: false
            };
            cornerstoneTools.removeToolState(element, toolType, stackPrefetchData);
        }
        else
        {
            stackPrefetchData.enabled = false;
        }
    }

    // module/private exports
    cornerstoneTools.stackPrefetch = {
        enable: enable,
        disable: disable
        };

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/stackTools/stackPrefetch.js

// Begin Source: src/stackTools/stackScroll.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "stackScroll";

    function scroll(element, images)
    {
        var toolData = cornerstoneTools.getToolState(element, 'stack');
        if(toolData === undefined || toolData.data === undefined || toolData.data.length === 0) {
            return;
        }

        var stackData = toolData.data[0];

        var newImageIdIndex = stackData.currentImageIdIndex + images;
        newImageIdIndex = Math.min(stackData.imageIds.length - 1, newImageIdIndex);
        newImageIdIndex = Math.max(0, newImageIdIndex);

        if(newImageIdIndex !== stackData.currentImageIdIndex)
        {
            var viewport = cornerstone.getViewport(element);
            cornerstone.loadAndCacheImage(stackData.imageIds[newImageIdIndex]).then(function(image) {
                stackData = toolData.data[0];
                if(stackData.newImageIdIndex !== newImageIdIndex) {
                    stackData.currentImageIdIndex = newImageIdIndex;
                    cornerstone.displayImage(element, image, viewport);
                }
            });
        }
    }

    function mouseUpCallback(e, eventData)
    {
        $(eventData.element).off("CornerstoneToolsMouseDrag", mouseDragCallback);
        $(eventData.element).off("CornerstoneToolsMouseUp", mouseUpCallback);
    }

    function mouseDownCallback(e, eventData)
    {
        if(cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {

            var mouseDragEventData = {
                deltaY : 0,
                options: e.data.options
            };
            $(eventData.element).on("CornerstoneToolsMouseDrag", mouseDragEventData, mouseDragCallback);
            $(eventData.element).on("CornerstoneToolsMouseUp", mouseUpCallback);
            e.stopImmediatePropagation();
            return false;
        }
    }

    function mouseDragCallback(e, eventData)
    {
        e.data.deltaY += eventData.deltaPoints.page.y;

        var toolData = cornerstoneTools.getToolState(eventData.element, 'stack');
        if(toolData === undefined || toolData.data === undefined || toolData.data.length === 0) {
            return;
        }
        var stackData = toolData.data[0];

        var pixelsPerImage = $(eventData.element).height() / stackData.imageIds.length ;
        if(e.data.options !== undefined && e.data.options.stackScrollSpeed !== undefined) {
            pixelsPerImage = e.data.options.stackScrollSpeed;
        }

        if(e.data.deltaY >=pixelsPerImage || e.data.deltaY <= -pixelsPerImage)
        {
            var imageDelta = e.data.deltaY / pixelsPerImage;
            var imageDeltaMod = e.data.deltaY % pixelsPerImage;
            var imageIdIndexOffset = Math.round(imageDelta);
            e.data.deltaY = imageDeltaMod;

            var imageIdIndex = stackData.currentImageIdIndex + imageIdIndexOffset;
            imageIdIndex = Math.min(stackData.imageIds.length - 1, imageIdIndex);
            imageIdIndex = Math.max(0, imageIdIndex);
            if(imageIdIndex !== stackData.currentImageIdIndex)
            {
                stackData.currentImageIdIndex = imageIdIndex;
                var viewport = cornerstone.getViewport(eventData.element);
                cornerstone.loadAndCacheImage(stackData.imageIds[imageIdIndex]).then(function(image) {
                    // only display this image if it is the current one to be displayed - it may not
                    // be if the user scrolls quickly
                    var stackData = toolData.data[0];
                    if(stackData.currentImageIdIndex === imageIdIndex) {
                        cornerstone.displayImage(eventData.element, image, viewport);
                    }
                });
            }

        }

        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }

    function mouseWheelCallback(e, eventData)
    {
        var images = -eventData.direction;
        scroll(eventData.element, images);
    }

    function onDrag(e) {
        var mouseMoveData = e.originalEvent.detail;
        var eventData = {
            deltaY : 0
        };
        eventData.deltaY += mouseMoveData.deltaPoints.page.y;

        var toolData = cornerstoneTools.getToolState(mouseMoveData.element, 'stack');
        if(toolData === undefined || toolData.data === undefined || toolData.data.length === 0) {
            return;
        }

        var stackData = toolData.data[0];
        if(eventData.deltaY >=3 || eventData.deltaY <= -3)
        {
            var imageDelta = eventData.deltaY / 3;
            var imageDeltaMod = eventData.deltaY % 3;
            var imageIdIndexOffset = Math.round(imageDelta);
            eventData.deltaY = imageDeltaMod;

            var imageIdIndex = stackData.currentImageIdIndex + imageIdIndexOffset;
            imageIdIndex = Math.min(stackData.imageIds.length - 1, imageIdIndex);
            imageIdIndex = Math.max(0, imageIdIndex);
            if(imageIdIndex !== stackData.currentImageIdIndex)
            {
                stackData.currentImageIdIndex = imageIdIndex;
                var viewport = cornerstone.getViewport(mouseMoveData.element);
                cornerstone.loadAndCacheImage(stackData.imageIds[imageIdIndex]).then(function(image) {
                    cornerstone.displayImage(mouseMoveData.element, image, viewport);
                });
            }
        }

        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }

    // module/private exports
    cornerstoneTools.stackScroll = cornerstoneTools.simpleMouseButtonTool(mouseDownCallback);
    cornerstoneTools.stackScrollWheel = cornerstoneTools.mouseWheelTool(mouseWheelCallback);
    cornerstoneTools.stackScrollTouchDrag = cornerstoneTools.touchDragTool(onDrag);

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/stackTools/stackScroll.js

// Begin Source: src/stateManagement/imageIdSpecificStateManager.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This implements an imageId specific tool state management strategy.  This means that
    // measurements data is tied to a specific imageId and only visible for enabled elements
    // that are displaying that imageId.
    
    function activeToolcoordinate(){
      var cooordsData="",selectionColor="greenyellow",toolsColor="white";
        function setActiveToolCoords(eventData){
             
              cooordsData=eventData.currentPoints.image;
        }
        function getActiveToolCoords(){
          return cooordsData;
        }
        function setActivecolor(color){
         selectionColor=color;
        }
        function getActivecolor(){
          return selectionColor;
        }
        function setToolcolor(toolcolor){
         toolsColor=toolcolor;
        }
        function getToolcolor(){
          return toolsColor;
        }
      
         var activeTool = {
            setToolColor:setToolcolor,
            setActiveColor:setActivecolor,
            getToolColor:getToolcolor,
            getActiveColor:getActivecolor,
            setCoords:setActiveToolCoords,
            getCoords:getActiveToolCoords
        };
        return activeTool;
    }

    function newImageIdSpecificToolStateManager() {
        var toolState = {};

        // here we add tool state, this is done by tools as well
        // as modules that restore saved state
        function addImageIdSpecificToolState(element, toolType, data)
        {
            var enabledImage = cornerstone.getEnabledElement(element);
            // if we don't have any tool state for this imageId, add an empty object
            if(toolState.hasOwnProperty(enabledImage.image.imageId) === false)
            {
                toolState[enabledImage.image.imageId] = {};
            }
            var imageIdToolState = toolState[enabledImage.image.imageId];

            // if we don't have tool state for this type of tool, add an empty object
            if(imageIdToolState.hasOwnProperty(toolType) === false)
            {
                imageIdToolState[toolType] = {
                    data: []
                };
            }
            var toolData = imageIdToolState[toolType];

            // finally, add this new tool to the state
            toolData.data.push(data);
        }

        // here you can get state - used by tools as well as modules
        // that save state persistently
        function getImageIdSpecificToolState(element, toolType)
        {
            var enabledImage = cornerstone.getEnabledElement(element);
            // if we don't have any tool state for this imageId, return undefined
            if(toolState.hasOwnProperty(enabledImage.image.imageId) === false)
            {
                return undefined;
            }
            var imageIdToolState = toolState[enabledImage.image.imageId];

            // if we don't have tool state for this type of tool, return undefined
            if(imageIdToolState.hasOwnProperty(toolType) === false)
            {
                return undefined;
            }
            var toolData = imageIdToolState[toolType];
            return toolData;
        }

        var imageIdToolStateManager = {
            get: getImageIdSpecificToolState,
            add: addImageIdSpecificToolState
        };
        return imageIdToolStateManager;
    }

    // a global imageIdSpecificToolStateManager - the most common case is to share state between all
    // visible enabled images
    var globalImageIdSpecificToolStateManager = newImageIdSpecificToolStateManager();
   var activetoolsData=activeToolcoordinate();
    // module/private exports
    cornerstoneTools.newImageIdSpecificToolStateManager = newImageIdSpecificToolStateManager;
    cornerstoneTools.globalImageIdSpecificToolStateManager = globalImageIdSpecificToolStateManager;
    cornerstoneTools.activeToolcoordinate=activetoolsData;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/stateManagement/imageIdSpecificStateManager.js

// Begin Source: src/stateManagement/stackSpecificStateManager.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This implements an Stack specific tool state management strategy.  This means
    // that tool data is shared between all imageIds in a given stack
    function newStackSpecificToolStateManager(toolTypes, oldStateManager) {
        var toolState = {};

        // here we add tool state, this is done by tools as well
        // as modules that restore saved state
        function addStackSpecificToolState(element, toolType, data)
        {
            // if this is a tool type to apply to the stack, do so
            if(toolTypes.indexOf(toolType) >= 0) {
                var enabledImage = cornerstone.getEnabledElement(element);

                // if we don't have tool state for this type of tool, add an empty object
                if(toolState.hasOwnProperty(toolType) === false)
                {
                    toolState[toolType] = {
                        data: []
                    };
                }
                var toolData = toolState[toolType];

                // finally, add this new tool to the state
                toolData.data.push(data);
            }
            else {
                // call the imageId specific tool state manager
                return oldStateManager.add(element, toolType, data);
            }
        }

        // here you can get state - used by tools as well as modules
        // that save state persistently
        function getStackSpecificToolState(element, toolType)
        {
            // if this is a tool type to apply to the stack, do so
            if(toolTypes.indexOf(toolType) >= 0) {
                // if we don't have tool state for this type of tool, add an empty object
                if(toolState.hasOwnProperty(toolType) === false)
                {
                    toolState[toolType] = {
                        data: []
                    };
                }
                var toolData = toolState[toolType];
                return toolData;
            }
            else
            {
                // call the imageId specific tool state manager
                return oldStateManager.get(element, toolType);
            }
        }

        var imageIdToolStateManager = {
            get: getStackSpecificToolState,
            add: addStackSpecificToolState
        };
        return imageIdToolStateManager;
    }

    var stackStateManagers = [];

    function addStackStateManager(element)
    {
        var oldStateManager = cornerstoneTools.getElementToolStateManager(element);
        if(oldStateManager === undefined) {
            oldStateManager = cornerstoneTools.globalImageIdSpecificToolStateManager;
        }

        var stackTools = ['stack', 'stackScroll', 'playClip', 'volume', 'slab', 'referenceLines'];
        var stackSpecificStateManager = cornerstoneTools.newStackSpecificToolStateManager(stackTools, oldStateManager);
        stackStateManagers.push(stackSpecificStateManager);
        cornerstoneTools.setElementToolStateManager(element, stackSpecificStateManager);
    }

    // module/private exports
    cornerstoneTools.newStackSpecificToolStateManager = newStackSpecificToolStateManager;
    cornerstoneTools.addStackStateManager = addStackStateManager;


    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/stateManagement/stackSpecificStateManager.js

// Begin Source: src/stateManagement/timeSeriesSpecificStateManager.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This implements an Stack specific tool state management strategy.  This means
    // that tool data is shared between all imageIds in a given stack
    function newTimeSeriesSpecificToolStateManager(toolTypes, oldStateManager) {
        var toolState = {};

        // here we add tool state, this is done by tools as well
        // as modules that restore saved state
        function addStackSpecificToolState(element, toolType, data)
        {
            // if this is a tool type to apply to the stack, do so
            if(toolTypes.indexOf(toolType) >= 0) {
                var enabledImage = cornerstone.getEnabledElement(element);

                // if we don't have tool state for this type of tool, add an empty object
                if(toolState.hasOwnProperty(toolType) === false)
                {
                    toolState[toolType] = {
                        data: []
                    };
                }
                var toolData = toolState[toolType];

                // finally, add this new tool to the state
                toolData.data.push(data);
            }
            else {
                // call the imageId specific tool state manager
                return oldStateManager.add(element, toolType, data);
            }
        }

        // here you can get state - used by tools as well as modules
        // that save state persistently
        function getStackSpecificToolState(element, toolType)
        {
            // if this is a tool type to apply to the stack, do so
            if(toolTypes.indexOf(toolType) >= 0) {
                // if we don't have tool state for this type of tool, add an empty object
                if(toolState.hasOwnProperty(toolType) === false)
                {
                    toolState[toolType] = {
                        data: []
                    };
                }
                var toolData = toolState[toolType];
                return toolData;
            }
            else
            {
                // call the imageId specific tool state manager
                return oldStateManager.get(element, toolType);
            }
        }

        var imageIdToolStateManager = {
            get: getStackSpecificToolState,
            add: addStackSpecificToolState
        };
        return imageIdToolStateManager;
    }

    var timeSeriesStateManagers = [];

    function addTimeSeriesStateManager(element, tools)
    {
        tools = tools || ['timeSeries'];
        var oldStateManager = cornerstoneTools.getElementToolStateManager(element);
        if(oldStateManager === undefined) {
            oldStateManager = cornerstoneTools.globalImageIdSpecificToolStateManager;
        }

        var timeSeriesSpecificStateManager = cornerstoneTools.newTimeSeriesSpecificToolStateManager(tools, oldStateManager);
        timeSeriesStateManagers.push(timeSeriesSpecificStateManager);
        cornerstoneTools.setElementToolStateManager(element, timeSeriesSpecificStateManager);
    }

    // module/private exports
    cornerstoneTools.newTimeSeriesSpecificToolStateManager = newTimeSeriesSpecificToolStateManager;
    cornerstoneTools.addTimeSeriesStateManager = addTimeSeriesStateManager;


    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/stateManagement/timeSeriesSpecificStateManager.js

// Begin Source: src/stateManagement/toolStateManager.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function getElementToolStateManager(element)
    {
        var enabledImage = cornerstone.getEnabledElement(element);
        // if the enabledImage has no toolStateManager, create a default one for it
        // NOTE: This makes state management element specific
        if(enabledImage.toolStateManager === undefined) {
            enabledImage.toolStateManager = cornerstoneTools.globalImageIdSpecificToolStateManager;
        }
        return enabledImage.toolStateManager;
    }

    // here we add tool state, this is done by tools as well
    // as modules that restore saved state
    function addToolState(element, toolType, data)
    {
        var toolStateManager = getElementToolStateManager(element);
        toolStateManager.add(element, toolType, data);
        // TODO: figure out how to broadcast this change to all enabled elements so they can update the image
        // if this change effects them
    }

    // here you can get state - used by tools as well as modules
    // that save state persistently
    function getToolState(element, toolType)
    {
        var toolStateManager = getElementToolStateManager(element);
        return toolStateManager.get(element, toolType);
    }

    function removeToolState(element, toolType, data)
    {
        var toolStateManager = getElementToolStateManager(element);
        var toolData = toolStateManager.get(element, toolType);
        // find this tool data
        var indexOfData = -1;
        for(var i = 0; i < toolData.data.length; i++) {
            if(toolData.data[i] === data)
            {
                indexOfData = i;
            }
        }
        if(indexOfData !== -1) {
            toolData.data.splice(indexOfData, 1);
        }
    }

    // sets the tool state manager for an element
    function setElementToolStateManager(element, toolStateManager)
    {
        var enabledImage = cornerstone.getEnabledElement(element);
        enabledImage.toolStateManager = toolStateManager;
    }

    /*
     function getElementToolStateManager(element)
     {
     var enabledImage = cornerstone.getEnabledElement(element);
     return enabledImage.toolStateManager;
     }
     */

    // module/private exports
    cornerstoneTools.addToolState = addToolState;
    cornerstoneTools.getToolState = getToolState;
    cornerstoneTools.removeToolState = removeToolState;
    cornerstoneTools.setElementToolStateManager = setElementToolStateManager;
    cornerstoneTools.getElementToolStateManager = getElementToolStateManager;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/stateManagement/toolStateManager.js

// Begin Source: src/synchronization/panZoomSynchronizer.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This function synchronizes the target zoom and pan to match the source
    function panZoomSynchronizer(synchronizer, sourceElement, targetElement) {

        // ignore the case where the source and target are the same enabled element
        if(targetElement === sourceElement) {
            return;
        }
        // get the source and target viewports
        var sourceViewport = cornerstone.getViewport(sourceElement);
        var targetViewport = cornerstone.getViewport(targetElement);

        // do nothing if the scale and translation are the same
        if(targetViewport.scale === sourceViewport.scale &&
            targetViewport.translation.x === sourceViewport.translation.x &&
            targetViewport.translation.y === sourceViewport.translation.y) {
            return;
        }

        // scale and/or translation are different, sync them
        targetViewport.scale = sourceViewport.scale;
        targetViewport.translation.x = sourceViewport.translation.x;
        targetViewport.translation.y = sourceViewport.translation.y;
        synchronizer.setViewport(targetElement, targetViewport);
    }


    // module/private exports
    cornerstoneTools.panZoomSynchronizer = panZoomSynchronizer;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/synchronization/panZoomSynchronizer.js

// Begin Source: src/synchronization/stackImageIndexSynchronizer.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This function causes the image in the target stack to be set to the one closest
    // to the image in the source stack by image position
    function stackImageIndexSynchronizer(synchronizer, sourceElement, targetElement) {

        // ignore the case where the source and target are the same enabled element
        if(targetElement === sourceElement) {
            return;
        }

        var sourceStackToolDataSource = cornerstoneTools.getToolState(sourceElement, 'stack');
        var sourceStackData = sourceStackToolDataSource.data[0];
        var targetStackToolDataSource = cornerstoneTools.getToolState(targetElement, 'stack');
        var targetStackData = targetStackToolDataSource.data[0];

        var newImageIdIndex = sourceStackData.currentImageIdIndex;

        // clamp the index
        newImageIdIndex = Math.min(Math.max(newImageIdIndex, 0), targetStackData.imageIds.length -1);

        // Do nothing if the index has not changed
        if(newImageIdIndex === targetStackData.currentImageIdIndex)
        {
            return;
        }

        cornerstone.loadAndCacheImage(targetStackData.imageIds[newImageIdIndex]).then(function(image) {
            var viewport = cornerstone.getViewport(targetElement);
            targetStackData.currentImageIdIndex = newImageIdIndex;
            synchronizer.displayImage(targetElement, image, viewport);
        });
    }

    // module/private exports
    cornerstoneTools.stackImageIndexSynchronizer = stackImageIndexSynchronizer;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/synchronization/stackImageIndexSynchronizer.js

// Begin Source: src/synchronization/stackImagePositionSynchronizer.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This function causes the image in the target stack to be set to the one closest
    // to the image in the source stack by image position
    function stackImagePositionSynchronizer(synchronizer, sourceElement, targetElement) {

        // ignore the case where the source and target are the same enabled element
        if(targetElement === sourceElement) {
            return;
        }

        var sourceImage = cornerstone.getEnabledElement(sourceElement).image;
        var sourceImagePlane = cornerstoneTools.metaData.get('imagePlane', sourceImage.imageId);
        var sourceImagePosition = sourceImagePlane.imagePositionPatient;

        var stackToolDataSource = cornerstoneTools.getToolState(targetElement, 'stack');
        var stackData = stackToolDataSource.data[0];

        var minDistance = Number.MAX_VALUE;
        var newImageIdIndex = -1;

        $.each(stackData.imageIds, function(index, imageId) {
            var imagePlane = cornerstoneTools.metaData.get('imagePlane', imageId);
            var imagePosition = imagePlane.imagePositionPatient;
            var distance = imagePosition.distanceToSquared(sourceImagePosition);
            //console.log(index + '=' + distance);
            if(distance < minDistance) {
                minDistance = distance;
                newImageIdIndex = index;
            }
        });

        if(newImageIdIndex === stackData.currentImageIdIndex)
        {
            return;
        }

        if(newImageIdIndex !== -1) {
            cornerstone.loadAndCacheImage(stackData.imageIds[newImageIdIndex]).then(function(image) {
                var viewport = cornerstone.getViewport(targetElement);
                stackData.currentImageIdIndex = newImageIdIndex;
                synchronizer.displayImage(targetElement, image, viewport);
            });
        }
    }

    // module/private exports
    cornerstoneTools.stackImagePositionSynchronizer = stackImagePositionSynchronizer;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/synchronization/stackImagePositionSynchronizer.js

// Begin Source: src/synchronization/synchronizer.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This object is responsible for synchronizing target elements when an event fires on a source
    // element
    function Synchronizer(event, handler) {

        var that = this;
        var sourceElements = []; // source elements fire the events we want to synchronize to
        var targetElements = []; // target elements we want to synchronize to source elements

        var ignoreFiredEvents = false;

        function fireEvent(sourceEnabledElement) {

            // Broadcast an event that something changed
            ignoreFiredEvents = true;
            $.each(targetElements, function(index, targetEnabledElement) {
                handler(that, sourceEnabledElement, targetEnabledElement);
            });
            ignoreFiredEvents = false;
        }

        function onEvent(e)
        {
            if(ignoreFiredEvents === true) {
                //console.log("event ignored");
                return;
            }
            fireEvent(e.currentTarget);
        }

        // adds an element as a source
        this.addSource = function(element) {
            // Return if this element was previously added
            var index = sourceElements.indexOf(element);
            if(index !== -1) {
                return;
            }

            // Add to our list of enabled elements
            sourceElements.push(element);

            // subscribe to the event
            $(element).on(event, onEvent);

            // Update everyone listening for events
            fireEvent(element);
        };

        // adds an element as a target
        this.addTarget = function(element) {
            // Return if this element was previously added
            var index = targetElements.indexOf(element);
            if(index !== -1) {
                return;
            }

            // Add to our list of enabled elements
            targetElements.push(element);

            // Invoke the handler for this new target element
            handler(that, element, element);
        };

        // adds an element as both a source and a target
        this.add = function(element) {
            that.addSource(element);
            that.addTarget(element);
        };

        // removes an element as a source
        this.removeSource = function(element) {
            // Find the index of this element
            var index = sourceElements.indexOf(element);
            if(index === -1) {
                return;
            }

            // remove this element from the array
            sourceElements.splice(index, 1);

            // stop listening for the event
            $(element).off(event, onEvent);

            // Update everyone listening for events
            fireEvent(element);
        };

        // removes an element as a target
        this.removeTarget = function(element) {
            // Find the index of this element
            var index = targetElements.indexOf(element);
            if(index === -1) {
                return;
            }

            // remove this element from the array
            targetElements.splice(index, 1);

            // Invoke the handler for the removed target
            handler(that, element, element);
        };

        // removes an element as both a source and target
        this.remove = function(element) {
            that.removeTarget(element);
            that.removeSource(element);
        };

        // returns the source elements
        this.getSourceElements = function() {
            return sourceElements;
        };

        this.displayImage = function(element, image, viewport) {
            ignoreFiredEvents = true;
            cornerstone.displayImage(element, image, viewport);
            ignoreFiredEvents = false;
        };

        this.setViewport = function(element, viewport) {
            ignoreFiredEvents = true;
            cornerstone.setViewport(element, viewport);
            ignoreFiredEvents = false;
        };
    }

    // module/private exports
    cornerstoneTools.Synchronizer = Synchronizer;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/synchronization/synchronizer.js

// Begin Source: src/synchronization/updateImageSynchronizer.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This function causes the target image to be drawn immediately
    function updateImageSynchronizer(synchronizer, sourceElement, targetElement) {

        // ignore the case where the source and target are the same enabled element
        if(targetElement === sourceElement) {
            return;
        }

        cornerstone.updateImage(targetElement);
    }

    // module/private exports
    cornerstoneTools.updateImageSynchronizer = updateImageSynchronizer;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/synchronization/updateImageSynchronizer.js

// Begin Source: src/synchronization/wwwcSynchronizer.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // This function synchronizes the target element ww/wc to match the source element
    function wwwcSynchronizer(synchronizer, sourceElement, targetElement) {

        // ignore the case where the source and target are the same enabled element
        if(targetElement === sourceElement) {
            return;
        }
        // get the source and target viewports
        var sourceViewport = cornerstone.getViewport(sourceElement);
        var targetViewport = cornerstone.getViewport(targetElement);

        // do nothing if the ww/wc already match
        if(targetViewport.voi.windowWidth === sourceViewport.voi.windowWidth &&
            targetViewport.voi.windowCenter === sourceViewport.voi.windowCenter &&
            targetViewport.invert === sourceViewport.invert) {
            return;
        }

        // www/wc are different, sync them
        targetViewport.voi.windowWidth = sourceViewport.voi.windowWidth;
        targetViewport.voi.windowCenter = sourceViewport.voi.windowCenter;
        targetViewport.invert = sourceViewport.invert;
        synchronizer.setViewport(targetElement, targetViewport);
    }


    // module/private exports
    cornerstoneTools.wwwcSynchronizer = wwwcSynchronizer;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/synchronization/wwwcSynchronizer.js

// Begin Source: src/timeSeriesTools/ProbeTool4D.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "probe4D";

    function updateLineSample(measurementData)
    {
        var samples = [];

        measurementData.timeSeries.stacks.forEach(function(stack) {
            cornerstone.loadAndCacheImage(stack.imageIds[measurementData.imageIdIndex]).then(function(image) {
                var offset = Math.round(measurementData.handles.end.x) + Math.round(measurementData.handles.end.y) * image.width;
                var sample = image.getPixelData()[offset];
                samples.push(sample);
                //console.log(sample);
            });
        });
        measurementData.lineSample.set(samples);
    }

    ///////// BEGIN ACTIVE TOOL ///////
    function createNewMeasurement(mouseEventData)
    {
        var timeSeriestoolData = cornerstoneTools.getToolState(mouseEventData.element, 'timeSeries');
        if(timeSeriestoolData === undefined || timeSeriestoolData.data === undefined || timeSeriestoolData.data.length === 0) {
            return;
        }
        var timeSeries = timeSeriestoolData.data[0];

        // create the measurement data for this tool with the end handle activated
        var measurementData = {
            timeSeries: timeSeries,
            lineSample : new cornerstoneTools.LineSampleMeasurement(),
            imageIdIndex: timeSeries.stacks[timeSeries.currentStackIndex].currentImageIdIndex,
            visible: true,
            handles: {
                end: {
                    x: mouseEventData.currentPoints.image.x,
                    y: mouseEventData.currentPoints.image.y,
                    highlight: true,
                    active: true
                }
            }
        };
        updateLineSample(measurementData);
        cornerstoneTools.MeasurementManager.add(measurementData);
        return measurementData;
    }
    ///////// END ACTIVE TOOL ///////


    ///////// BEGIN IMAGE RENDERING ///////

    function onImageRendered(e, eventData) {

        // if we have no toolData for this element, return immediately as there is nothing to do
        var toolData = cornerstoneTools.getToolState(e.currentTarget, toolType);
        if(toolData === undefined) {
            return;
        }

        // we have tool data for this element - iterate over each one and draw it
        var context = eventData.canvasContext.canvas.getContext("2d");
        cornerstone.setToPixelCoordinateSystem(eventData.enabledElement, context);
        var color="white";
        for(var i=0; i < toolData.data.length; i++) {
            context.save();
            var data = toolData.data[i];

            // draw the handles
            context.beginPath();
            cornerstoneTools.drawHandles(context, eventData, data.handles,color);
            context.stroke();

            // Draw text
            var fontParameters = cornerstoneTools.setContextToDisplayFontSize(eventData.enabledElement, eventData.canvasContext, 15);
            context.font = "" + fontParameters.fontSize + "px Arial";

            // translate the x/y away from the cursor
            var x = Math.round(data.handles.end.x);
            var y = Math.round(data.handles.end.y);
            textX = data.handles.end.x + 3;
            textY = data.handles.end.y - 3;

            var textX = textX / fontParameters.fontScale;
            var textY = textY / fontParameters.fontScale;

            context.fillStyle = "white";

            context.fillText("" + x + "," + y, textX, textY);

            context.restore();
        }
    }
    ///////// END IMAGE RENDERING ///////


    // module exports
    cornerstoneTools.probeTool4D = cornerstoneTools.mouseButtonTool({
        createNewMeasurement : createNewMeasurement,
        onImageRendered: onImageRendered,
        toolType : toolType
    });


    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));
 
// End Source; src/timeSeriesTools/ProbeTool4D.js

// Begin Source: src/timeSeriesTools/timeSeries.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "timeSeriesScroll";

    function incrementTimePoint(element, timePoints, wrap)
    {
        var toolData = cornerstoneTools.getToolState(element, 'timeSeries');
        if(toolData === undefined || toolData.data === undefined || toolData.data.length === 0) {
            return;
        }

        var timeSeriesData = toolData.data[0];
        var currentStack = timeSeriesData.stacks[timeSeriesData.currentStackIndex];
        var currentImageIdIndex = currentStack.currentImageIdIndex;
        var newStackIndex = timeSeriesData.currentStackIndex + timePoints;

        // loop around if we go outside the stack
        if(wrap) {
            if (newStackIndex >= timeSeriesData.stacks.length)
            {
                newStackIndex =0;
            }
            if(newStackIndex < 0) {
                newStackIndex = timeSeriesData.stacks.length -1;
            }
        }
        else {
            newStackIndex = Math.min(timeSeriesData.stacks.length - 1, newStackIndex);
            newStackIndex = Math.max(0, newStackIndex);
        }

        if(newStackIndex !== timeSeriesData.currentStackIndex)
        {
            var viewport = cornerstone.getViewport(element);
            var newStack = timeSeriesData.stacks[newStackIndex];
            cornerstone.loadAndCacheImage(newStack.imageIds[currentImageIdIndex]).then(function(image) {
                if(timeSeriesData.currentImageIdIndex !== currentImageIdIndex) {
                    newStack.currentImageIdIndex = currentImageIdIndex;
                    timeSeriesData.currentStackIndex = newStackIndex;
                    //var stackToolData = cornerstoneTools.getToolState(element, 'stack');
                    //stackToolData[0] = newStack;
                    cornerstone.displayImage(element, image, viewport);
                }
            });
        }
    }

    // module/private exports
    cornerstoneTools.incrementTimePoint = incrementTimePoint;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/timeSeriesTools/timeSeries.js

// Begin Source: src/timeSeriesTools/timeSeriesPlayer.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "timeSeriesPlayer";

    /**
     * Starts playing a clip or adjusts the frame rate of an already playing clip.  framesPerSecond is
     * optional and defaults to 30 if not specified.  A negative framesPerSecond will play the clip in reverse.
     * The element must be a stack of images
     * @param element
     * @param framesPerSecond
     */
    function playClip(element, framesPerSecond)
    {
        if(element === undefined) {
            throw "playClip: element must not be undefined";
        }
        if(framesPerSecond === undefined) {
            framesPerSecond = 30;
        }

        var timeSeriesToolData = cornerstoneTools.getToolState(element, 'timeSeries');
        if (timeSeriesToolData === undefined || timeSeriesToolData.data === undefined || timeSeriesToolData.data.length === 0) {
            return;
        }
        var timeSeriesData = timeSeriesToolData.data[0];

        var playClipToolData = cornerstoneTools.getToolState(element, toolType);
        var playClipData;
        if (playClipToolData === undefined || playClipToolData.data.length === 0) {
            playClipData = {
                intervalId : undefined,
                framesPerSecond: framesPerSecond,
                lastFrameTimeStamp: undefined,
                frameRate: 0
            };
            cornerstoneTools.addToolState(element, toolType, playClipData);
        }
        else {
            playClipData = playClipToolData.data[0];
            playClipData.framesPerSecond = framesPerSecond;
        }

        // if already playing, do not set a new interval
        if(playClipData.intervalId !== undefined) {
            return;
        }

        playClipData.intervalId = setInterval(function() {
            var currentImageIdIndex = timeSeriesData.stacks[timeSeriesData.currentStackIndex].currentImageIdIndex;

            var newStackIndex = timeSeriesData.currentStackIndex;
            if(playClipData.framesPerSecond > 0) {
                cornerstoneTools.incrementTimePoint(element, 1, true);
            } else {
                cornerstoneTools.incrementTimePoint(element, -1,true);
            }



        }, 1000/Math.abs(playClipData.framesPerSecond));
    }

    /**
     * Stops an already playing clip.
     * * @param element
     */
    function stopClip(element)
    {
        var playClipToolData = cornerstoneTools.getToolState(element, toolType);
        var playClipData;
        if (playClipToolData === undefined || playClipToolData.data.length === 0) {
            return;
        }
        else {
            playClipData = playClipToolData.data[0];
        }

        clearInterval(playClipData.intervalId);
        playClipData.intervalId = undefined;
    }


    // module/private exports
    cornerstoneTools.timeSeriesPlayer = {
        start : playClip,
        stop: stopClip
    };

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/timeSeriesTools/timeSeriesPlayer.js

// Begin Source: src/timeSeriesTools/timeSeriesScroll.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    var toolType = "timeSeriesScroll";

    function mouseUpCallback(e, eventData)
    {
        $(eventData.element).off("CornerstoneToolsMouseDrag", mouseDragCallback);
        $(eventData.element).off("CornerstoneToolsMouseUp", mouseUpCallback);
    }

    function mouseDownCallback(e, eventData)
    {
        if(cornerstoneTools.isMouseButtonEnabled(eventData.which, e.data.mouseButtonMask)) {

            var mouseDragEventData = {
                deltaY : 0,
                options: e.data.options
            };
            $(eventData.element).on("CornerstoneToolsMouseDrag", mouseDragEventData, mouseDragCallback);
            $(eventData.element).on("CornerstoneToolsMouseUp", mouseUpCallback);
            e.stopImmediatePropagation();
            return false;
        }
    }

    function mouseDragCallback(e, eventData)
    {
        e.data.deltaY += eventData.deltaPoints.page.y;

        var toolData = cornerstoneTools.getToolState(eventData.element, 'timeSeries');
        if(toolData === undefined || toolData.data === undefined || toolData.data.length === 0) {
            return;
        }
        var timeSeriesData = toolData.data[0];

        var pixelsPerTimeSeries = $(eventData.element).height() / timeSeriesData.stacks.length ;
        if(e.data.options !== undefined && e.data.options.timeSeriesScrollSpeed !== undefined) {
            pixelsPerTimeSeries = e.data.options.timeSeriesScrollSpeed;
        }

        if(e.data.deltaY >=pixelsPerTimeSeries || e.data.deltaY <= -pixelsPerTimeSeries)
        {
            var timeSeriesDelta = Math.round(e.data.deltaY / pixelsPerTimeSeries);
            var timeSeriesDeltaMod = e.data.deltaY % pixelsPerTimeSeries;
            cornerstoneTools.incrementTimePoint(eventData.element, timeSeriesDelta);
            e.data.deltaY = timeSeriesDeltaMod;
        }

        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }

    function mouseWheelCallback(e, eventData)
    {
        var images = -eventData.direction;
        cornerstoneTools.incrementTimePoint(eventData.element, images);
    }

    function onDrag(e) {
        var mouseMoveData = e.originalEvent.detail;
        var eventData = {
            deltaY : 0
        };
        eventData.deltaY += mouseMoveData.deltaPoints.page.y;

        var toolData = cornerstoneTools.getToolState(mouseMoveData.element, 'stack');
        if(toolData === undefined || toolData.data === undefined || toolData.data.length === 0) {
            return;
        }

        if(eventData.deltaY >=3 || eventData.deltaY <= -3)
        {
            var timeSeriesDelta = eventData.deltaY / 3;
            var timeSeriesDeltaMod = eventData.deltaY % 3;
            cornerstoneTools.setTimePoint(eventData.element, timeSeriesDelta);
            eventData.deltaY = timeSeriesDeltaMod;
        }

        return false; // false = cases jquery to preventDefault() and stopPropagation() this event
    }


    // module/private exports
    cornerstoneTools.timeSeriesScroll = cornerstoneTools.simpleMouseButtonTool(mouseDownCallback);
    cornerstoneTools.timeSeriesScrollWheel = cornerstoneTools.mouseWheelTool(mouseWheelCallback);
    cornerstoneTools.timeSeriesScrollTouchDrag = cornerstoneTools.touchDragTool(onDrag);

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/timeSeriesTools/timeSeriesScroll.js

// Begin Source: src/util/RoundToDecimal.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function roundToDecimal(value, precision) {
        var multiplier = Math.pow(10, precision);

        return (Math.round(value * multiplier) / multiplier);
    }

    // module exports
    cornerstoneTools.roundToDecimal = roundToDecimal;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/util/RoundToDecimal.js

// Begin Source: src/util/copyPoints.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneMath, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function copyPoints(points)
    {
        var page = cornerstoneMath.point.copy(points.page);
        var image = cornerstoneMath.point.copy(points.image);
        return {
            page : page,
            image: image
        };
    }


    // module exports
    cornerstoneTools.copyPoints = copyPoints;


    return cornerstoneTools;
}($, cornerstone, cornerstoneMath, cornerstoneTools)); 
// End Source; src/util/copyPoints.js

// Begin Source: src/util/drawEllipse.js

var cornerstoneTools = (function (cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    // http://stackoverflow.com/questions/2172798/how-to-draw-an-oval-in-html5-canvas
    function drawEllipse(ctx, x, y, w, h) {
        var kappa = 0.5522848,
            ox = (w / 2) * kappa, // control point offset horizontal
            oy = (h / 2) * kappa, // control point offset vertical
            xe = x + w,           // x-end
            ye = y + h,           // y-end
            xm = x + w / 2,       // x-middle
            ym = y + h / 2;       // y-middle

        ctx.beginPath();
        ctx.moveTo(x, ym);
        ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
        ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
        ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
        ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
        ctx.closePath();
        ctx.stroke();
    }

    // Module exports
    cornerstoneTools.drawEllipse = drawEllipse;

    return cornerstoneTools;
}(cornerstoneTools)); 
// End Source; src/util/drawEllipse.js

// Begin Source: src/util/isMouseButtonEnabled.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function isMouseButtonEnabled(which, mouseButtonMask)
    {
        /*jshint bitwise: false*/
        var mouseButton = (1 << (which - 1));
        return ((mouseButtonMask & mouseButton) !== 0);
    }

    // module exports
    cornerstoneTools.isMouseButtonEnabled = isMouseButtonEnabled;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/util/isMouseButtonEnabled.js

// Begin Source: src/util/pauseEvent.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    /**
     * This function is used to prevent selection from occuring when left click dragging on the image
     * @param e the event that is provided to your event handler
     * Based on: http://stackoverflow.com/questions/5429827/how-can-i-prevent-text-element-selection-with-cursor-drag
     * @returns {boolean}
     */
    function pauseEvent(e)
    {
        if(e.stopPropagation) {
            e.stopPropagation();
        }
        if(e.preventDefault) {
            e.preventDefault();
        }
        e.cancelBubble=true;
        e.returnValue=false;
        return false;
    }

    // module exports
    cornerstoneTools.pauseEvent = pauseEvent;


    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/util/pauseEvent.js

// Begin Source: src/util/pointProjector.js
var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }
    if(cornerstoneTools.referenceLines === undefined) {
        cornerstoneTools.referenceLines = {};
    }

    // projects a patient point to an image point
    function projectPatientPointToImagePlane(patientPoint, imagePlane)
    {
        var point = patientPoint.clone().sub(imagePlane.imagePositionPatient);
        var x = imagePlane.columnCosines.dot(point) / imagePlane.columnPixelSpacing;
        var y = imagePlane.rowCosines.dot(point) / imagePlane.rowPixelSpacing;
        var imagePoint = {x: x, y: y};
        return imagePoint;
    }

    // projects an image point to a patient point
    function imagePointToPatientPoint(imagePoint, imagePlane)
    {
        var x = imagePlane.columnCosines.clone().multiplyScalar(imagePoint.x);
        x.multiplyScalar(imagePlane.columnPixelSpacing);
        var y = imagePlane.rowCosines.clone().multiplyScalar(imagePoint.y);
        y.multiplyScalar(imagePlane.rowPixelSpacing);
        var patientPoint = x.add(y);
        patientPoint.add(imagePlane.imagePositionPatient);
        return patientPoint;
    }

    // module/private exports
    cornerstoneTools.projectPatientPointToImagePlane = projectPatientPointToImagePlane;
    cornerstoneTools.imagePointToPatientPoint = imagePointToPatientPoint;

    return cornerstoneTools;
}($, cornerstone, cornerstoneTools)); 
// End Source; src/util/pointProjector.js

// Begin Source: src/util/setContextToDisplayFontSize.js
/**
 * This module sets the transformation matrix for a canvas context so it displays fonts
 * smoothly even when the image is highly scaled up
 */

var cornerstone = (function (cornerstone) {

    "use strict";

    if(cornerstone === undefined) {
        cornerstone = {};
    }

    /**
     * Sets the canvas context transformation matrix so it is scaled to show text
     * more cleanly even if the image is scaled up.  See
     * https://github.com/chafey/cornerstoneTools/wiki/DrawingText
     * for more information
     *
     * @param ee
     * @param context
     * @param fontSize
     * @returns {{fontSize: number, lineHeight: number, fontScale: number}}
     */
    function setContextToDisplayFontSize(ee, context, fontSize)
    {
        var fontScale = 0.1;
        cornerstone.setToPixelCoordinateSystem(ee, context, fontScale);
        // return the font size to use
        var scaledFontSize = fontSize / ee.viewport.scale / fontScale;
        // TODO: actually calculate this?
        var lineHeight  = fontSize / ee.viewport.scale / fontScale;
        return {
            fontSize :scaledFontSize,
            lineHeight:lineHeight,
            fontScale: fontScale
        };
    }

    // Module exports
    cornerstoneTools.setContextToDisplayFontSize = setContextToDisplayFontSize;

    return cornerstone;
}(cornerstone)); 
// End Source; src/util/setContextToDisplayFontSize.js
