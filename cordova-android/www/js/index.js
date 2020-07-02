const app = {
    initialize: function() {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
    },

    onDeviceReady: function() {
        this.receivedEvent('deviceready');
    },

    receivedEvent: function(id) {
        navigator.mediaDevices.getUserMedia({
            video:true,
            audio:true
        }).then((stream) => {
            document.getElementById("camera").srcObject = stream;
        }).catch(err => {
            console.log(err);
        });
    }
};

app.initialize();