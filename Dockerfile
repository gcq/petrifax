FROM node
RUN apt-get update && apt-get upgrade -y
RUN apt-get install festival-ca ffmpeg -y
RUN curl "http://festcat.talp.cat/download/upc_ca_pau_hts-1.3.tgz" > upc_ca_pau_hts-1.3.tgz
RUN tar -xzf upc_ca_pau_hts-1.3.tgz
RUN rm upc_ca_pau_hts-1.3.tgz
RUN mv upc_ca_pau_hts /usr/share/festival/voices/catalan/upc_ca_pau_hts
ADD sql/* petrifax/sql/
ADD *.js petrifax/
ADD *.json petrifax/
ADD db.sqlite3 petrifax/
#RUN git clone https://github.com/gcq/petrifax
WORKDIR petrifax
RUN npm i