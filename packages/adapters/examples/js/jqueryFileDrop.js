$.fn.extend({
    filedrop: function (options) {
        var defaults = {
            callback : null
        }
        options =  $.extend(defaults, options)
        return this.each(function() {
            var files = []
            var $this = $(this)

            // Stop default browser actions
            $this.bind('dragover dragleave', function(event) {
                event.stopPropagation()
                event.preventDefault()
            })

            // Catch drop event
            $this.bind('drop', function(event) {
                // Stop default browser actions
                event.stopPropagation()
                event.preventDefault()

                // Get all files that are dropped
                files = event.originalEvent.target.files || event.originalEvent.dataTransfer.files

                // Convert uploaded file to data URL and pass trought callback
                if(options.callback) {
                    var reader = new FileReader()
                    reader.onload = function(event) {
                        options.callback(event.target.result)
                    }
                    reader.readAsArrayBuffer(files[0])
                }
                return false
            })
        })
    }
});

$(document).ready(function() {
    function ignoreDrag(e) {
        e.originalEvent.stopPropagation();
        e.originalEvent.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
    };

    $('#dropZone')
        .bind('dragenter', ignoreDrag)
        .bind('dragover', ignoreDrag);
});