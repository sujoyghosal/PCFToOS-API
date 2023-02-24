docker build . -t pcf-to-openshift/node-apis
docker run -d -p 5555:5555 --name api pcf-to-openshift/node-apis
