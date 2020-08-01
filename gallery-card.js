import {
  LitElement,
  html,
  css
} from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";

class GalleryCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
      resources: {},
      currentResourceIndex: {},
      autoPlayVideo: {},
      xDown: {},
      yDown: {}
    };
  }

  render() {
    const entityId = this.config.entity;
    const entityState = this.hass.states[entityId];
    const menuAlignment = (this.config.menu_alignment || "responsive").toLowerCase();
    const maximumFiles = this.config.maximum_files;
    const fileNameFormat = this.config.file_name_format;
    const captionFormat = this.config.caption_format;
    this._loadResources(entityState.attributes.fileList, maximumFiles, fileNameFormat, captionFormat);

    return html`
        <ha-card .header=${this.config.title} class="menu-${menuAlignment}">
          <div class="resource-viewer" @touchstart="${ev => this._handleTouchStart(ev)}" @touchmove="${ev => this._handleTouchMove(ev)}">
            <figure>
              ${this._isImageExtension(this._currentResource().extension) ?
                html`<img src="${this._currentResource().url}"/>` :
                html`<video controls src="${this._currentResource().url}#t=0.1" @loadedmetadata="${ev => this._videoMetadataLoaded(ev)}" @canplay="${ev => this._startVideo(ev)}"></video>`
              }
              <figcaption>${this._currentResource().caption} <span class="duration"></span></figcaption>
            </figure>  
            <button class="btn btn-left" @click="${ev => this._selectResource(this.currentResourceIndex-1)}">&lt;</button> 
            <button class="btn btn-right" @click="${ev => this._selectResource(this.currentResourceIndex+1)}">&gt;</button> 
          </div>
          <div class="resource-menu">
            ${this.resources.map(resource => {
                return html`
                    <figure id="resource${resource.index}" data-imageIndex="${resource.index}" @click="${ev => this._selectResource(resource.index)}" class="${(resource.index == this.currentResourceIndex) ? 'selected' : ''}">
                    ${this._isImageExtension(resource.extension) ?
                      html`<img src="${resource.url}"/>` :
                      html`<video src="${resource.url}#t=0.1" @loadedmetadata="${ev => this._videoMetadataLoaded(ev)}" ></video>`
                    }
                    <figcaption>${resource.caption} <span class="duration"></span></figcaption>
                    </figure>
                `;
            })}
          </div>
        </ha-card>
    `;
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("Required configuration for entity is missing");
    }
    this.config = config;
    this.currentResourceIndex = 0;
  }

  static getConfigElement() {
    return document.createElement("gallery-card-editor");
  }

  getCardSize() {
    return 1;
  }

  _isImageExtension(ext) {
    return(ext.match(/(jpeg|jpg|gif|png|tiff|bmp)$/) != null);
  }

  _selectResource(idx) {
    this.autoPlayVideo = true;

    if (idx < 0)
      this.currentResourceIndex = this.resources.length - 1;
    else if (idx >= this.resources.length)
      this.currentResourceIndex = 0;
    else
      this.currentResourceIndex = idx;

    var elt = this.shadowRoot.querySelector("#resource" + this.currentResourceIndex);
    if (elt)
      elt.scrollIntoView({behavior: "smooth", block: "nearest", inline: "nearest"});
  }

  _getResource(index) {
    if (this.resources !== undefined && index !== undefined && this.resources.length > 0) {
      return this.resources[index];
    }
    else {
      return {
        url: "",
        name: "",
        extension: "jpg",
        caption: "No images or videos to display",
        index: 0
      };
    }
  }

  _currentResource() {
    return this._getResource(this.currentResourceIndex);
  }

  _startVideo(evt) {
  	if (this.autoPlayVideo)
  		evt.target.play();
  }

  _videoMetadataLoaded(evt) {
    evt.target.parentNode.querySelector(".duration").innerHTML = "[" + this._getFormattedVideoDuration(evt.target.duration) + "]";    
  }

  _getFormattedVideoDuration(duration) {
  	var minutes = parseInt(duration / 60);
    if (minutes < 10)
      minutes = "0" + minutes;

    var seconds = parseInt(duration % 60);
    seconds = "0" + seconds;
    seconds = seconds.substring(seconds.length - 2);
    
    return minutes + ":" + seconds;    
  }  
  
  _handleTouchStart(evt) {                                         
      this.xDown = evt.touches[0].clientX;                                      
      this.yDown = evt.touches[0].clientY;                                      
  }; 
  
  _handleTouchMove(evt) {
      if ( ! this.xDown || ! this.yDown ) {
          return;
      }
      var xUp = evt.touches[0].clientX;                                    
      var yUp = evt.touches[0].clientY;
      var xDiff = this.xDown - xUp;
      var yDiff = this.yDown - yUp;
  
      if ( Math.abs( xDiff ) > Math.abs( yDiff ) ) {/*most significant*/
          if ( xDiff > 0 ) {
          /* left swipe */ 
          this._selectResource(this.currentResourceIndex+1);
          evt.preventDefault();
          } else {
          /* right swipe */
          this._selectResource(this.currentResourceIndex-1);
          evt.preventDefault();
          }                       
      } else {
          if ( yDiff > 0 ) {
          /* up swipe */ 
          } else { 
          /* down swipe */
          }                                                                 
      }
      /* reset values */
      this.xDown = null;
      this.yDown = null;                                            
  };

  _loadResources(files, maximumFiles, fileNameFormat, captionFormat) {
    this.resources = [];

    if (!files)
      return;

    var lastIndex = 0;
    if(maximumFiles != undefined && !isNaN(maximumFiles) && maximumFiles < files.length) {
        lastIndex = files.length - maximumFiles;
    }

    var i;
    for(i = files.length - 1; i >= lastIndex; i--) {
      var filePath = files[i];
      // /config/downloads/front_door/
      // /config/www/...
      var fileUrl = filePath.replace("/config/www/", "/local/");
      if (filePath.indexOf("/config/www/") < 0)
        fileUrl = "/local/" + filePath.substring(filePath.indexOf("/www/")+5);
      
      var arfilePath = filePath.split("/");
      var fileName = arfilePath[arfilePath.length - 1];

      if (fileName != '@eaDir') {
        var arFileName = fileName.split(".");
        var ext = arFileName[arFileName.length - 1].toLowerCase();
        fileName = fileName.substring(0, fileName.length - ext.length - 1);

        var fileCaption = "";
        if (fileNameFormat === undefined || captionFormat === undefined)
            fileCaption = fileName;
        else {
          var tokens = ["%YYY", "%m", "%d", "%H", "%M", "%S", "%p"]
          fileCaption = captionFormat;

          var hr = 0;
          for (let token of tokens) {
            var searchIndex = fileNameFormat.indexOf(token);

            if (searchIndex >= 0) {
              var val = fileName.substring(searchIndex, searchIndex + token.length);
              if (token == "%H" && captionFormat.indexOf("%p") >= 0) {
                hr = parseInt(val);
                if (val == "00") val = 12;
                if (parseInt(val) > 12) val = parseInt(val) - 12;
              }
              if (token == "%m" || token == "%d" | token == "%H") val = parseInt(val);
              fileCaption = fileCaption.replace(token, val);
            }
          }

          fileCaption = fileCaption.replace("%p", (hr > 11 ? "PM" : "AM"));
        }

        var resource = {
          url: fileUrl,
          name: fileName,
          extension: ext,
          caption: fileCaption,
          index: this.resources.length
        }
      
        this.resources.push(resource);
      }
    }
  }

  static get styles() {
    return css`
      .content {
        overflow: hidden;
      }
      .content hui-card-preview {
        max-width: 100%;
      }
      ha-card {
        height: 100%;
        overflow: hidden;
      }
      figcaption {
        text-align:center;
        white-space: nowrap;
      }
      img, video {
        width: 100%;
        object-fit: contain;
      }
      .resource-viewer .btn {
        position: absolute;
        transform: translate(-50%, -50%);
        -ms-transform: translate(-50%, -50%);
        background-color: #555;
        color: white;
        font-size: 16px;
        padding: 12px 12px;
        border: none;
        cursor: pointer;
        border-radius: 5px;
        opacity: 0;
        transition: opacity .35s ease;
      }
      .resource-viewer:hover .btn {
        opacity: 1;
      }
      .resource-viewer .btn-left {
        left: 0%;
        margin-left: 65px;
      }
      .resource-viewer .btn-right {
        right: 0%;
        margin-right: 30px
      }
      figure.selected {
        opacity: 0.5;
      }
      .duration {
        font-style:italic;
      }
      @media all and (max-width: 599px) {
        .menu-responsive .resource-viewer {
          width: 100%;
        }
        .menu-responsive .resource-viewer .btn {
          top: 33%;
        }
        .menu-responsive .resource-menu {
          width:100%; 
          overflow-y: hidden;
          overflow-x: scroll;
          display: flex;
        }
        .menu-responsive .resource-menu figure {
          margin: 0px;
          padding: 12px;
        }
      }

      @media all and (min-width: 600px) {
        .menu-responsive .resource-viewer {
          float: left;
          width: 75%;
          position: relative;
        }
        .menu-responsive .resource-viewer .btn {
          top: 40%;
        }
                
        .menu-responsive .resource-menu {
          width:25%; 
          height: calc(100vh - 120px);
          overflow-y: scroll; 
          float: right;
        }
      }

      .menu-bottom .resource-viewer {
        width: 100%;
      }
      .menu-bottom .resource-viewer .btn {
        top: 33%;
      }
      .menu-bottom .resource-menu {
        width:100%; 
        overflow-y: hidden;
        overflow-x: scroll;
        display: flex;
      }
      .menu-bottom .resource-menu figure {
        margin: 0px;
        padding: 12px;
      }
      .menu-bottom .resource-viewer figure img,
      .menu-bottom .resource-viewer figure video {
        max-height: 70vh;
      }

      .menu-right .resource-viewer {
        float: left;
        width: 75%;
        position: relative;
      }
      .menu-right .resource-viewer .btn {
        top: 40%;
      }
              
      .menu-right .resource-menu {
        width:25%; 
        height: calc(100vh - 120px);
        overflow-y: scroll; 
        float: right;
      }

      .menu-left .resource-viewer {
        float: right;
        width: 75%;
        position: relative;
      }
      .menu-left .resource-viewer .btn {
        top: 40%;
      }
              
      .menu-left .resource-menu {
        width:25%; 
        height: calc(100vh - 120px);
        overflow-y: scroll; 
        float: left;
      }

      .menu-top {
        display: flex;
        flex-direction: column;
      }
      .menu-top .resource-viewer {
        width: 100%;
        order: 2
      }
      .menu-top .resource-viewer .btn {
        top: 45%;
      }
      .menu-top .resource-menu {
        width:100%; 
        overflow-y: hidden;
        overflow-x: scroll;
        display: flex;
        order: 1
      }
      .menu-top .resource-menu figure {
        margin: 0px;
        padding: 12px;
      }
      .menu-top .resource-viewer figure img,
      .menu-top .resource-viewer figure video {
        max-height: 70vh;
      }

      .menu-hidden .resource-viewer {
        width: 100%;
      }
      .menu-hidden .resource-viewer .btn {
        top: 33%;
      }
      .menu-hidden .resource-menu {
        width:100%; 
        overflow-y: hidden;
        overflow-x: scroll;
        display: none;
      }
    `;
  }
}
customElements.define("gallery-card", GalleryCard);

class GalleryCardEditor extends LitElement {
  static get properties() {
    return {
      _fileNameExample: {},
      _captionExample: {}
    };
  }

  setConfig(config) {
    this._config = config;

    this._fileNameExample =  "Your_File_Name";
    if (this._config.file_name_format && this._config.file_name_format != "") {
      this._fileNameExample = this.generateSampleText(this._config.file_name_format, true);
    }
    this._captionExample =  this._fileNameExample;
    if (this._config.file_name_format && this._config.file_name_format != ""
      && this._config.caption_format && this._config.caption_format != "") {
      this._captionExample = this.generateSampleText(this._config.caption_format, false);
    } 
  }

  configChanged(newConfig) {
    const event = new Event("config-changed", {
      bubbles: true,
      composed: true
    });
    event.detail = {config: newConfig};
    this.dispatchEvent(event);
  }

  get _title() {
    return this._config.title || "";
  }

  get _menuAlignment() {
    return this._config.menu_alignment || "Responsive";
  }

  get _entity() {
    return this._config.entity || "";
  }

  get _maximumFiles() {
    return this._config.maximum_files || "";
  }

  get _fileNameFormat() {
    return this._config.file_name_format || "";
  }

  get _captionFormat() {
    return this._config.caption_format || "";
  }

  formatDate2Digits(str, zeroPad) {
    if (zeroPad) {
      var myString = "0" + str;
      return myString.slice(myString.length-2,myString.length);
    }
    else {
      return str;
    }
  }

  generateSampleText(formatString, zeroPad) {
    var d = new Date();
    var returnString = formatString;
    returnString = returnString.replace("%YYY", d.getFullYear());
    returnString = returnString.replace("%m", this.formatDate2Digits(d.getMonth() + 1, zeroPad));
    returnString = returnString.replace("%d", this.formatDate2Digits(d.getDate(), zeroPad));

    var hr = d.getHours();
    if (returnString.indexOf("%p") >= 0) {
      if (hr > 12)
        hr = hr - 12;
      if (hr == 0)
        hr = 12;
    }
    
    returnString = returnString.replace("%H", this.formatDate2Digits(hr, zeroPad));
    returnString = returnString.replace("%M", this.formatDate2Digits(d.getMinutes(), zeroPad));
    returnString = returnString.replace("%S", this.formatDate2Digits(d.getSeconds(), zeroPad));
    returnString = returnString.replace("%p", ((d.getHours()) > 11 ? "PM" : "AM"));

    return returnString;
  }

  render() {
    return html`
    <div class="card-config">
    <div class="side-by-side">
      <paper-input
        .label="${this.hass.localize(
          "ui.panel.lovelace.editor.card.generic.title"
        )} (${this.hass.localize(
          "ui.panel.lovelace.editor.card.config.optional"
        )})"
        .value="${this._title}"
        .configValue="${"title"}"
        @value-changed="${this._valueChanged}"
      ></paper-input>
      <paper-dropdown-menu 
        .label="${"Alignment of Image/Video Menu"}
        (${this.hass.localize(
          "ui.panel.lovelace.editor.card.config.optional"
        )})"
        .value="${this._menuAlignment}" 
        .configValue="${"menu_alignment"}" 
        @value-changed="${this._valueChanged}" >
        <paper-listbox slot="dropdown-content">
          <paper-item>Responsive</paper-item>
          <paper-item>Left</paper-item>
          <paper-item>Right</paper-item>
          <paper-item>Top</paper-item>
          <paper-item>Bottom</paper-item>
          <paper-item>Hidden</paper-item>
        </paper-listbox>
      </paper-dropdown-menu>
    </div>
    <div class="side-by-side">
      <paper-dropdown-menu 
        .label="${this.hass.localize(
          "ui.panel.lovelace.editor.card.generic.entity"
        )} (${this.hass.localize(
          "ui.panel.lovelace.editor.card.config.required"
        )})"
        .value="${this._entity}" 
        .configValue="${"entity"}" 
        @value-changed="${this._valueChanged}" >
        <paper-listbox slot="dropdown-content">
          ${Object.keys(this.hass.states).filter(entId => this.hass.states[entId].attributes.fileList != undefined).sort().map(entId => html`
                <paper-item>${entId}</paper-item>
            `)}
        </paper-listbox>
      </paper-dropdown-menu>
      <paper-input
        .label="${"Maximum files to display"}
        (${this.hass.localize(
          "ui.panel.lovelace.editor.card.config.optional"
        )})"
        .value="${this._maximumFiles}"
        .configValue="${"maximum_files"}"
        @value-changed="${this._valueChanged}"
      ></paper-input>
    </div>
    <div class="side-by-side">
      <div class="instructions">
        Use the following placeholders to reformat the file name into the caption:
        <ul>
          <li>%YYY - A 4 digit year, e.g. 2019</li>
          <li>%m - The 2 digit month</li>
          <li>%d - The 2 digit day</li>
          <li>%H - The 2 digit hour</li>
          <li>%M - The 2 digit minute</li>
          <li>%S - The 2 digit seconds</li>
          <li>%p - 2 digits AM or PM (if included in caption_format, the output will be converted to 12 hour, if not the value will remain as the %H placeholder)</li>
        </ul>
      </div>
      <div>
        <paper-input
          .label="${"Format of File Names"}
          (${this.hass.localize(
            "ui.panel.lovelace.editor.card.config.optional"
          )})"
          .value="${this._fileNameFormat}"
          .configValue="${"file_name_format"}"
          @value-changed="${this._valueChanged}"
        ></paper-input>
        <div class="example">Your file names look like: ${this._fileNameExample}</div>
        <paper-input
          .label="${"Format for Caption"}
          (${this.hass.localize(
            "ui.panel.lovelace.editor.card.config.optional"
          )})"
          .value="${this._captionFormat}"
          .configValue="${"caption_format"}"
          @value-changed="${this._valueChanged}"
        ></paper-input>
        <div class="example">Your captions will look like: ${this._captionExample}</div>
      </div>
    </div>
    `;
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) {
      return;
    }

    const target = ev.target;

    if (
      (target.configValue === "title" && target.value === this._title) 
    ) {
      return;
    }

    if (target.configValue) {
      if (target.value === "") {
        this._config = { ...this._config };
        delete this._config[target.configValue];
      } else {
        this._config = {
          ...this._config,
          [target.configValue]:
            target.checked !== undefined ? target.checked : target.value,
        };
      }
    }

    this.configChanged(this._config);
  }

  static get styles() {
    return css`
      .side-by-side {
        display: flex;
      }
      .side-by-side > * {
        flex: 1;
        padding-right: 4px;
      }
      .instructions {
        font-size: x-small;
        border: solid 1px silver;
        background-color: whitesmoke;
        padding-left: 3px;
        margin-right: 8px;
      }
      .instructions ul {
        margin-top: 0px;
      }
      .example {
        font-size: small;
        font-style: italic;
      }
    `;
  }
}

customElements.define("gallery-card-editor", GalleryCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "gallery-card",
  name: "Gallery Card",
  preview: false, // Optional - defaults to false
  description: "The Gallery Card allows for viewing multiple images/videos.  Requires the Files sensor availble at https://github.com/TarheelGrad1998" // Optional
});